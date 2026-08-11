// Regra única da trava: a NF só sai com o contrato assinado, ou com liberação
// de exceção registrada por admin. Fica isolada aqui porque vale para os DOIS
// caminhos de NF (rascunho no Bling e registro de nota emitida por fora).
export type SituacaoNf = {
  contratoAssinado: boolean
  liberadaEm: Date | null
}

export function podeEmitirNf(s: SituacaoNf): boolean {
  return s.contratoAssinado || s.liberadaEm != null
}

export function motivoBloqueioNf(s: SituacaoNf): string | null {
  if (podeEmitirNf(s)) return null
  return 'O contrato desta venda ainda não foi assinado pelo cliente. Envie o contrato para assinatura ou peça a um administrador para liberar com justificativa.'
}
