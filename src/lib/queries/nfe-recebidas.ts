import { execRows } from '@/lib/db'
import { sql } from 'drizzle-orm'

export type NotaRecebida = {
  chave: string
  emitenteNome: string
  emitenteCnpj: string
  valor: string | null
  dataEmissao: Date
  situacao: string
  jaLancada: boolean
}

/**
 * As notas recebidas do grupo, já dizendo se a entrada foi registrada.
 *
 * "Já lançada" sai de uma junção com `motos.nota_fiscal_entrada`, não de uma
 * coluna: guardar como campo criaria uma segunda verdade que envelhece sozinha
 * quando a moto for registrada depois. O número da NF está nas posições 26–34
 * da chave de 44 dígitos — é assim que a nota do extrato encontra a moto.
 */
export async function listarNotasRecebidas(grupoId: string, dias = 90): Promise<NotaRecebida[]> {
  const linhas = await execRows(sql`
    SELECT n.chave, n.emitente_nome, n.emitente_cnpj, n.valor, n.data_emissao, n.situacao,
           EXISTS (
             SELECT 1 FROM motos m
               JOIN lojas l ON l.id = m.loja_id
              WHERE l.grupo_id = ${grupoId}
                AND regexp_replace(COALESCE(m.nota_fiscal_entrada, ''), '[^0-9]', '', 'g')
                    = ltrim(substring(n.chave from 26 for 9), '0')
           ) AS ja_lancada
      FROM nfe_recebidas n
     WHERE n.grupo_id = ${grupoId}
       AND n.data_emissao >= now() - ${`${dias} days`}::interval
     ORDER BY n.data_emissao DESC`)

  return linhas.map(l => ({
    chave: String(l.chave),
    emitenteNome: String(l.emitente_nome),
    emitenteCnpj: String(l.emitente_cnpj),
    valor: l.valor == null ? null : String(l.valor),
    dataEmissao: new Date(l.data_emissao),
    situacao: String(l.situacao),
    jaLancada: Boolean(l.ja_lancada),
  }))
}
