import { ambienteLiberado } from './ambiente'
import type { ConfigNotaGateway } from './client'

/**
 * Vincula a logo à empresa do grupo na NG, que passa a imprimi-la no DANFE:
 * https://docs.notagateway.com.br/v2/reference/vincular-logotipo
 * Fora do client.ts porque é o único envio multipart, e o client fala JSON.
 */
export async function vincularLogoNaNg(cfg: ConfigNotaGateway, png: Buffer): Promise<void> {
  if (!ambienteLiberado(cfg.ambiente, process.env.VERCEL_ENV)) {
    throw new Error('Fora da produção, a Nota Gateway só roda em homologação — troque o ambiente do grupo em Admin → Notas fiscais')
  }
  const corpo = new FormData()
  corpo.append('logotipo', new Blob([new Uint8Array(png)], { type: 'image/png' }), 'logo.png')
  const res = await fetch(`https://api.notagateway.com.br/v2/empresas/${cfg.empresaId}/logo`, {
    method: 'POST',
    headers: { Authorization: `Basic ${cfg.token}`, Accept: 'application/json' },
    body: corpo,
    cache: 'no-store',
  })
  // Só o status: a resposta da NG pode trazer o empresaId, que não sai em erro nem tela.
  if (!res.ok) throw new Error(`A Nota Gateway não aceitou a logo (HTTP ${res.status}). Tente de novo em alguns minutos.`)
}
