import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { adesoesMova, certificadosDigitais, notagatewayConfig } from '@/lib/db/schema'
import { decifrar } from '@/lib/cripto'
import { lerDadosDoPfx } from '@/lib/sefaz/certificado'

/**
 * Status do bloco "Dados para a Nota Gateway" (#588). Vai para o navegador: só datas e
 * booleanos, nunca o A1, a senha, o token ou o empresaId.
 */
export type StatusNg = {
  certificado: { recebido: false } | { recebido: true; validoAte: string | null; cnpjConfere: boolean | null; problema: string | null }
  cadastradaNaNg: boolean
}

export async function statusNgDaAdesao(adesaoId: string, exec: Pick<typeof db, 'select'> = db): Promise<StatusNg | null> {
  const [a] = await exec.select({
    cnpj: adesoesMova.cnpj, grupoId: adesoesMova.grupoId,
    certArquivo: adesoesMova.certArquivo, certSenha: adesoesMova.certSenha,
  }).from(adesoesMova).where(eq(adesoesMova.id, adesaoId)).limit(1)
  if (!a) return null

  const [ng] = a.grupoId
    ? await exec.select({ empresaId: notagatewayConfig.empresaId }).from(notagatewayConfig).where(eq(notagatewayConfig.grupoId, a.grupoId)).limit(1)
    : []
  const cadastradaNaNg = !!ng?.empresaId?.trim()

  const confere = (cnpj: string) => (a.cnpj ? cnpj === a.cnpj.replace(/\D/g, '') : null)

  // A1 ainda na adesão: abre para ler validade e CNPJ. Depois de aplicado, ele sai da
  // adesão e vale o de Certificados do grupo.
  if (a.certArquivo && a.certSenha) {
    try {
      const c = lerDadosDoPfx(decifrar(a.certArquivo), decifrar(a.certSenha).toString('utf8'))
      return { certificado: { recebido: true, validoAte: c.validoAte.toISOString(), cnpjConfere: confere(c.cnpj), problema: null }, cadastradaNaNg }
    } catch {
      return { certificado: { recebido: true, validoAte: null, cnpjConfere: null, problema: 'Não deu para abrir o certificado da adesão' }, cadastradaNaNg }
    }
  }
  if (a.grupoId) {
    const [c] = await exec.select({ cnpj: certificadosDigitais.cnpj, validoAte: certificadosDigitais.validoAte })
      .from(certificadosDigitais).where(eq(certificadosDigitais.grupoId, a.grupoId)).limit(1)
    if (c) return { certificado: { recebido: true, validoAte: c.validoAte.toISOString(), cnpjConfere: confere(c.cnpj), problema: null }, cadastradaNaNg }
  }
  return { certificado: { recebido: false }, cadastradaNaNg }
}
