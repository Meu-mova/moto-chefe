import { client } from '@/lib/db'

export const CAP = 200

export type ConsultaTipoErro = 'vazio' | 'nao_select' | 'multiplos' | 'timeout' | 'erro'

export class ConsultaError extends Error {
  constructor(public tipo: ConsultaTipoErro, public detalhe = '') {
    super(tipo)
    this.name = 'ConsultaError'
  }
}

export interface ResultadoConsulta {
  rows: unknown[]
  rowCount: number
  truncated: boolean
}

/** Roda UM SELECT sob transação read-only (nada escreve, nunca). */
export async function consultaSomenteLeitura(sqlBruto: string): Promise<ResultadoConsulta> {
  const sqlText = String(sqlBruto ?? '').trim()
  if (!sqlText) throw new ConsultaError('vazio')
  if (!/^select\b/i.test(sqlText)) throw new ConsultaError('nao_select')
  if (sqlText.includes(';')) throw new ConsultaError('multiplos')

  try {
    const rows = await client.begin(async (tx) => {
      await tx.unsafe('SET LOCAL transaction_read_only = on')
      await tx.unsafe('SET LOCAL statement_timeout = 5000')
      return await tx.unsafe(`SELECT * FROM ( ${sqlText} ) AS _jarvis_sub LIMIT ${CAP + 1}`)
    })
    const arr = Array.from(rows as Iterable<unknown>)
    const truncated = arr.length > CAP
    return { rows: arr.slice(0, CAP), rowCount: Math.min(arr.length, CAP), truncated }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'erro'
    if (/statement timeout|canceling statement/i.test(msg)) {
      throw new ConsultaError('timeout', msg.slice(0, 200))
    }
    throw new ConsultaError('erro', msg.slice(0, 200))
  }
}
