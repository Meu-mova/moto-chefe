// ─── Identificação da maquininha no relatório da InfinityPay ──────────────────
// O CSV traz o número de série do aparelho na coluna "Tipo - Dados adicionais",
// no formato "NS: PB1F254M76675", e repete esse serial dentro do NSU
// ("SPB1F254M7667522050320260730170001"). Como cada maquininha pertence a um
// grupo, o serial permite detectar que um arquivo está sendo importado no grupo
// errado — erro que já aconteceu e deixou uma transação de BH presa em Sul de
// Minas, impossível de conciliar.
//
// Só a InfinityPay traz esse dado; Stone e PagueVeloz não têm equivalente no
// arquivo, então para elas não há como fazer essa checagem.

export function extrairTerminalInfinityPay(dadosAdicionais: string | undefined): string | null {
  if (!dadosAdicionais) return null
  const m = dadosAdicionais.match(/NS:\s*([A-Za-z0-9]+)/)
  return m ? m[1] : null
}

/** O serial aparece dentro do NSU, então dá pra achar as transações do aparelho por LIKE. */
export function padraoNsuDoTerminal(terminal: string): string {
  return `%${terminal}%`
}
