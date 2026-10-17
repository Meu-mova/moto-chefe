// Regras da carta de correção da NF de saída (NT 2011/003 da SEFAZ).
import { MINUTOS_PARA_DESCARTAR } from './status'

export const TEXTO_MIN = 15
export const TEXTO_MAX = 1000

export type ValidacaoTexto = { ok: true; texto: string } | { ok: false; erro: string }

// A SEFAZ rejeita quebra de linha ou espaço nas pontas (rejeição 588), então o texto vai aparado.
export function validarTextoCarta(bruto: string): ValidacaoTexto {
  const texto = bruto.trim()
  if (texto.length < TEXTO_MIN) return { ok: false, erro: `A correção precisa de pelo menos ${TEXTO_MIN} caracteres.` }
  if (texto.length > TEXTO_MAX) return { ok: false, erro: `A correção pode ter no máximo ${TEXTO_MAX} caracteres.` }
  return { ok: true, texto }
}

// Limite da SEFAZ por nota (rejeição 594).
export const MAX_CARTAS = 20

export type SituacaoCarta = 'pendente' | 'autorizada' | 'recusada'

export type NumeroCarta = { ok: true; numero: number } | { ok: false; erro: string }

// Recusada não fica registrada na SEFAZ, então o número dela volta a ficar livre.
export function proximoNumeroCarta(cartas: { numero: number; situacao: SituacaoCarta }[]): NumeroCarta {
  if (cartas.some(c => c.situacao === 'pendente')) {
    return { ok: false, erro: 'Já há uma carta de correção aguardando a SEFAZ: reconsulte antes de enviar outra.' }
  }
  const numero = Math.max(0, ...cartas.filter(c => c.situacao === 'autorizada').map(c => c.numero)) + 1
  if (numero > MAX_CARTAS) return { ok: false, erro: `Esta nota já tem ${MAX_CARTAS} cartas de correção, o limite da SEFAZ.` }
  return { ok: true, numero }
}

// A doc da Nota Gateway só cita "Autorizada"; os demais nomes aguardam o suporte (#187).
// Até lá, todo outro status conta como pendente: a recusa só vem do 4xx do envio.
export function situacaoCarta(status: string): SituacaoCarta {
  return status === 'Autorizada' ? 'autorizada' : 'pendente'
}

/**
 * Carta presa em pendente (envio que não chegou à Nota Gateway, ou recusa com
 * status que ainda não sabemos ler) trava as próximas: depois do mesmo prazo da
 * NF, dá para descartar, se a consulta confirmar que a carta não existe lá.
 */
export function podeDescartarCarta(carta: { situacao: SituacaoCarta; criadoEm: string }, agora: Date): boolean {
  return carta.situacao === 'pendente' && agora.getTime() - Date.parse(carta.criadoEm) >= MINUTOS_PARA_DESCARTAR * 60_000
}
