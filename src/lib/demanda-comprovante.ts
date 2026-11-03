import { conferirComprovante } from '@/lib/comprovante-arquivo'

// Comprovante do sinal da demanda (prioridade): obrigatório para quem registra o sinal,
// guardado no bucket privado 'comprovantes' em demandas/<grupoId>/ e apagado depois de
// 90 dias pelo cron /api/cron/comprovantes-demanda. O caminho nasce no servidor, a partir
// do grupo da loja da demanda; o cliente nunca manda caminho.

export const PASTA_COMPROVANTE_SINAL = 'demandas'
export const DIAS_COMPROVANTE_SINAL = 90

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function caminhoComprovanteSinal(grupoId: string, ext: string, id: string = crypto.randomUUID()): string {
  if (!UUID.test(grupoId)) throw new Error('Grupo inválido')
  return `${PASTA_COMPROVANTE_SINAL}/${grupoId}/${id}.${ext}`
}

/** O arquivo do sinal: obrigatório, foto ou PDF de até 10MB. */
export function exigirComprovanteSinal(arquivo: File | null | undefined): { arquivo: File; ext: string } {
  if (!arquivo || arquivo.size === 0) throw new Error('Anexe o comprovante do valor do sinal')
  const c = conferirComprovante(arquivo)
  if (!c.ok) throw new Error(c.erro)
  return { arquivo, ext: c.ext }
}

/** Ainda dá para abrir: o cron apaga o arquivo depois de 90 dias do envio. */
export function comprovanteSinalVigente(enviadoEm: Date | string | null, agora: Date = new Date()): boolean {
  if (!enviadoEm) return false
  const ms = new Date(enviadoEm).getTime()
  return agora.getTime() - ms < DIAS_COMPROVANTE_SINAL * 24 * 60 * 60 * 1000
}
