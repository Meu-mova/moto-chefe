// Quanto a tela espera antes de dizer que ninguém do outro lado respondeu.
export const LIMITE_AGENTE_MS = 60_000
// Quanto uma coleta pode demorar antes de ser considerada travada. As três
// operadoras juntas levam bem menos que isso.
export const LIMITE_EXECUCAO_MS = 5 * 60_000

export type SituacaoPedido = 'pendente' | 'offline' | 'rodando' | 'travado' | 'concluida' | 'erro'

type Pedido = {
  status: string
  criadoEm: Date
  iniciadoEm: Date | null
}

/**
 * Traduz o estado gravado no banco para o que a tela mostra. A diferença entre
 * "pendente" e "offline" é só tempo: o agente pergunta a cada 15 segundos, então
 * um pedido parado há mais de um minuto significa que não tem ninguém ouvindo.
 */
export function situacaoDoPedido(pedido: Pedido, agora: Date): SituacaoPedido {
  if (pedido.status === 'concluida') return 'concluida'
  if (pedido.status === 'erro') return 'erro'

  if (pedido.status === 'rodando') {
    const inicio = pedido.iniciadoEm ?? pedido.criadoEm
    return agora.getTime() - inicio.getTime() > LIMITE_EXECUCAO_MS ? 'travado' : 'rodando'
  }

  return agora.getTime() - pedido.criadoEm.getTime() > LIMITE_AGENTE_MS ? 'offline' : 'pendente'
}
