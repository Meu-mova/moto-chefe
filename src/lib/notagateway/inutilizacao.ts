// Regras da inutilização de número da NF de saída (#504), pelas respostas do suporte da Nota Gateway.
import { ehDenegada, ehDuplicidade } from './status'

export const JUSTIFICATIVA_MIN = 15
export const JUSTIFICATIVA_MAX = 255

export type ValidacaoJustificativa = { ok: true; justificativa: string } | { ok: false; erro: string }

// A NG só aceita ASCII básico: o acento sai, e o que sobrar fora disso (emoji, travessão) recusa.
export function validarJustificativa(bruta: string): ValidacaoJustificativa {
  const justificativa = bruta.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
  if (/[^\x20-\x7e]/.test(justificativa)) return { ok: false, erro: 'A justificativa só aceita letras, números e pontuação simples.' }
  if (justificativa.length < JUSTIFICATIVA_MIN) return { ok: false, erro: `A justificativa precisa de pelo menos ${JUSTIFICATIVA_MIN} caracteres.` }
  if (justificativa.length > JUSTIFICATIVA_MAX) return { ok: false, erro: `A justificativa pode ter no máximo ${JUSTIFICATIVA_MAX} caracteres.` }
  return { ok: true, justificativa }
}

export type SituacaoInutilizacao = 'pendente' | 'autorizada' | 'negada'

export function situacaoInutilizacao(status: string): SituacaoInutilizacao {
  if (status === 'InutilizacaoAutorizada') return 'autorizada'
  if (status === 'InutilizacaoNegada') return 'negada'
  return 'pendente'
}

export type NotaParaInutilizar = {
  status: string
  motivoStatus: string | null
  numero: string | null
  serie: string | null
  vendaId: string | null
}

export type Elegibilidade = { ok: true; serie: string; numero: number } | { ok: false; erro: string }

/**
 * Só a recusada pela SEFAZ gasta número sem nota: a Descartada nunca chegou à NG
 * (o número vem da resposta dela). A denegada também chega como "Negada" e já
 * usou o número, como a 539. Recusada de venda ativa ainda vai ser reenviada com
 * o mesmo número, salvo se a venda já tem outra nota viva com número diferente.
 */
export function elegivelParaInutilizar(nota: NotaParaInutilizar, outraNotaVivaDaVenda: { numero: string | null } | null): Elegibilidade {
  if (nota.status !== 'Negada') return { ok: false, erro: 'Só se inutiliza o número de nota rejeitada pela SEFAZ.' }
  const numero = Number(nota.numero)
  if (!nota.serie?.trim() || !Number.isInteger(numero) || numero < 1) {
    return { ok: false, erro: 'Esta nota não tem número gravado: não há o que inutilizar.' }
  }
  if (ehDenegada(nota) || ehDuplicidade(nota)) return { ok: false, erro: 'O número desta nota já foi usado na SEFAZ e não pode ser inutilizado.' }
  // Inteiro, não texto: "0974" e "974" são o mesmo número.
  const substituida = !!outraNotaVivaDaVenda && Number(outraNotaVivaDaVenda.numero) !== numero
  if (nota.vendaId && !substituida) return { ok: false, erro: 'A venda desta nota continua ativa: corrija e reenvie a nota em vez de inutilizar o número.' }
  return { ok: true, serie: nota.serie.trim(), numero }
}
