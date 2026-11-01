import { createHmac } from 'node:crypto'
import { and, count, eq, gt, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tentativasAcao } from '@/lib/db/schema'

// Ações públicas (sem login) com limite por IP (#588).
export const LIMITES = {
  consultar_empresa: { maximo: 5, minutos: 10 },
  registrar_adesao: { maximo: 3, minutos: 60 },
} as const
export type AcaoLimitada = keyof typeof LIMITES

export const ERRO_MUITAS_TENTATIVAS = 'Muitas tentativas. Tente de novo em alguns minutos.'

// HMAC e não sha256 puro: IPv4 são só 4 bilhões de valores, e o hash sem chave se desfaz por força bruta.
// Chave própria, não derivada da CERT_MASTER_KEY: se vazar, não abre nenhum A1.
function hashDoIp(ip: string): string {
  const chave = Buffer.from(process.env.TENTATIVAS_HMAC_KEY ?? '', 'base64')
  if (chave.length !== 32) throw new Error('TENTATIVAS_HMAC_KEY ausente ou inválida (base64 de 32 bytes)')
  return createHmac('sha256', chave).update(ip).digest('hex')
}

/** Conta a tentativa e diz se ainda está dentro do limite. Estourou: não grava nem age. */
export async function permitirTentativa(acao: AcaoLimitada, ip: string, exec: Pick<typeof db, 'transaction'> = db): Promise<boolean> {
  const { maximo, minutos } = LIMITES[acao]
  const ipHash = hashDoIp(ip)
  return exec.transaction(async tx => {
    // Trava por ação e IP: duas chamadas ao mesmo tempo não passam as duas pela contagem.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`${acao}:${ipHash}`}))`)
    const [r] = await tx.select({ n: count() }).from(tentativasAcao).where(and(
      eq(tentativasAcao.acao, acao), eq(tentativasAcao.ipHash, ipHash),
      gt(tentativasAcao.criadoEm, sql`now() - make_interval(mins => ${minutos})`),
    ))
    if ((r?.n ?? 0) >= maximo) return false
    await tx.insert(tentativasAcao).values({ acao, ipHash })
    return true
  })
}

/** A maior janela é de 1 hora; o que passou de 1 dia não conta mais para nada. Roda no cron diário do log. */
export async function apagarTentativasAntigas(exec: Pick<typeof db, 'delete'> = db): Promise<number> {
  const apagadas = await exec.delete(tentativasAcao)
    .where(lt(tentativasAcao.criadoEm, sql`now() - interval '1 day'`))
    .returning({ id: tentativasAcao.id })
  return apagadas.length
}
