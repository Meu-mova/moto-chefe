import forge from 'node-forge'
import { db } from '@/lib/db'
import { certificadosDigitais } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { cifrar, decifrar } from '@/lib/cripto'
import type { SiglaUf } from './uf'

export type DadosCertificado = { cnpj: string; titular: string; validoAte: Date }

/**
 * Abre o PKCS#12 e lê o que interessa do certificado do titular.
 *
 * O CNPJ vem do CN do subject, no formato "RAZAO SOCIAL:CNPJ" que a ICP-Brasil
 * usa. Ler isso na hora do upload é o que permite recusar na tela o certificado
 * do grupo errado, em vez de descobrir na primeira consulta à SEFAZ — quando o
 * erro chega como rejeição genérica.
 */
export function lerDadosDoPfx(pfx: Buffer, senha: string): DadosCertificado {
  let p12: forge.pkcs12.Pkcs12Pfx
  try {
    const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')))
    p12 = forge.pkcs12.pkcs12FromAsn1(asn1, senha)
  } catch {
    // node-forge dá o mesmo erro para senha errada e para arquivo corrompido.
    // Senha errada é o caso de longe mais comum no upload, e é o que a pessoa
    // consegue corrigir sozinha.
    throw new Error('Não foi possível abrir o certificado — senha incorreta ou arquivo inválido')
  }

  const bags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? []
  const cert = bags.map(b => b.cert).find((c): c is forge.pki.Certificate => !!c)
  if (!cert) throw new Error('Certificado não encontrado dentro do arquivo')

  const cn = cert.subject.getField('CN')?.value ?? ''
  const cnpj = (cn.split(':')[1] ?? '').replace(/\D/g, '')
  if (cnpj.length !== 14) throw new Error(`Não achei o CNPJ no certificado (CN: "${cn}")`)

  return { cnpj, titular: cn.split(':')[0].trim(), validoAte: cert.validity.notAfter }
}

/**
 * `uf` é a sigla da UF do autor da consulta (cUFAutor), escolhida na tela — o
 * certificado não a traz de forma confiável: o A1 emitido pela RFB tem ST/L no
 * subject, mas o de AC privada (o do Vale, por exemplo) não tem nenhum dos
 * dois. Por isso é parâmetro obrigatório, e não algo lido do .pfx.
 */
export async function salvarCertificado(
  grupoId: string, pfx: Buffer, senha: string, uf: SiglaUf,
  exec: Pick<typeof db, 'insert'> = db,
): Promise<DadosCertificado> {
  const dados = lerDadosDoPfx(pfx, senha)
  await exec.insert(certificadosDigitais)
    .values({
      grupoId,
      arquivo: cifrar(pfx),
      senha: cifrar(senha),
      cnpj: dados.cnpj,
      titular: dados.titular,
      uf,
      validoAte: dados.validoAte,
    })
    .onConflictDoUpdate({
      target: certificadosDigitais.grupoId,
      set: {
        arquivo: cifrar(pfx),
        senha: cifrar(senha),
        cnpj: dados.cnpj,
        titular: dados.titular,
        uf,
        validoAte: dados.validoAte,
        criadoEm: new Date(),
      },
    })
  return dados
}

/**
 * null = grupo sem certificado cadastrado. Quem chama decide o que fazer.
 *
 * `cnpj` vai junto no retorno (além de dentro do banco cifrado como parte dos
 * metadados em claro) porque as tasks seguintes que falam com a SEFAZ e casam
 * NF-e com o grupo certo precisam dele sem decifrar mais nada.
 */
export async function carregarCertificado(grupoId: string) {
  const [linha] = await db.select().from(certificadosDigitais)
    .where(eq(certificadosDigitais.grupoId, grupoId)).limit(1)
  if (!linha) return null
  return {
    pfx: decifrar(linha.arquivo),
    senha: decifrar(linha.senha).toString('utf8'),
    validoAte: linha.validoAte,
    cnpj: linha.cnpj,
    uf: linha.uf,
  }
}
