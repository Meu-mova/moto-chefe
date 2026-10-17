/**
 * Classificação dos status da NF de saída: os da Nota Gateway e os nossos
 * (Enviando, Processando, Descartada). Trava, consulta e tela decidem pela mesma lista.
 * Status oficiais: https://docs.notagateway.com.br/docs/status-da-nota-fiscal-no-gateway
 */

/**
 * Só estes liberam nova emissão. A trava (índice de nota única, na migração mais
 * recente que o cria, e checagem antes de emitir) é por exclusão de propósito: status intermediário, ou que a API passe
 * a ter depois, segura a venda em vez de deixar sair uma segunda nota (#80).
 */
export const STATUS_MORTOS = ['Negada', 'Denegada', 'Cancelada', 'Descartada']

const STATUS_FINAIS = [...STATUS_MORTOS, 'Autorizada', 'CancelamentoNegado']

/** Final: a nota não muda mais sozinha. Nos demais a tela oferece "Consultar". */
export function ehFinal(status: string): boolean {
  return STATUS_FINAIS.includes(status)
}

/**
 * Espera antes de descartar uma tentativa presa em Enviando (#88). A Nota Gateway
 * registra a nota ao recebê-la; a espera cobre o envio que ainda estava em
 * andamento, que hoje pode durar até o limite da função na Vercel.
 */
export const MINUTOS_PARA_DESCARTAR = 15

/** Tentativa que ficou em Enviando: o envio falhou e a nota pode não ter chegado. */
export function podeDescartarTentativa(nota: { status: string; criadoEm: string }, agora: Date): boolean {
  return nota.status === 'Enviando' && agora.getTime() - new Date(nota.criadoEm).getTime() >= MINUTOS_PARA_DESCARTAR * 60 * 1000
}

/** A SEFAZ não autorizou a nota. */
export function ehRecusada(status: string): boolean {
  return status === 'Negada' || status === 'Denegada'
}

/**
 * O statusSefaz só serve de motivo à nota recusada: na nota cancelada do teste no
 * staging (09/10/2026), ele veio "100 - Autorizado o uso da NF-e".
 */
export function motivoDoStatus(n: { status: string; motivoStatus: string | null; statusSefaz: string | null }): string | null {
  return n.motivoStatus ?? (ehRecusada(n.status) ? n.statusSefaz : null)
}

/** Regra geral da SEFAZ: 24h contadas da autorização; depois disso ela recusa com 220. */
const PRAZO_CANCELAMENTO_MS = 24 * 60 * 60 * 1000

const EM_CANCELAMENTO = ['SolicitandoCancelamento', 'CancelamentoSolicitado', 'EmProcessoDeCancelamento', 'CanceladaAguardandoAtualizacaoPDF']

/** Cancelamento pedido, à espera da SEFAZ. */
export function emCancelamento(status: string): boolean {
  return EM_CANCELAMENTO.includes(status)
}

/**
 * Fim de um pedido de cancelamento. Logo depois do pedido, a consulta ainda pode
 * devolver o estado de antes: a Autorizada, ou a recusa do pedido anterior, que
 * só conta se a Nota Gateway alterou a nota depois do pedido. Sem essa data, a
 * recusa de um "Tentar de novo" só aparece no fim das consultas.
 */
export function cancelamentoConcluido(
  n: { status: string; dataUltimaAlteracao: string | null },
  pedido: { statusAntes: string; em: Date },
): boolean {
  if (n.status === 'Cancelada') return true
  if (n.status !== 'CancelamentoNegado') return false
  return pedido.statusAntes !== 'CancelamentoNegado' || (!!n.dataUltimaAlteracao && new Date(n.dataUltimaAlteracao) >= pedido.em)
}

export type SituacaoCancelamento = 'disponivel' | 'fora_do_prazo' | 'em_andamento' | 'indisponivel' | 'sem_data'

/**
 * Só nota autorizada (ou com cancelamento negado) cancela. Pedir o cancelamento
 * de uma negada também volta "Cancelada" da API, mas é cancelamento lógico,
 * sem nada na SEFAZ.
 */
export function situacaoCancelamento(nota: { status: string; dataAutorizacao: string | null }, agora: Date): SituacaoCancelamento {
  if (emCancelamento(nota.status)) return 'em_andamento'
  if (nota.status !== 'Autorizada' && nota.status !== 'CancelamentoNegado') return 'indisponivel'
  if (!nota.dataAutorizacao) return 'sem_data'
  return agora < limiteCancelamento(nota.dataAutorizacao) ? 'disponivel' : 'fora_do_prazo'
}

/**
 * Depois das 24h, o contador pede à SEFAZ que libere o cancelamento; liberado, o
 * MOVA pede pela Nota Gateway como no prazo (#176). Homologação nunca valeu na SEFAZ.
 */
export function podeCancelarExtemporaneo(
  nota: { status: string; ambiente: string; dataAutorizacao: string | null },
  agora: Date,
): boolean {
  return nota.ambiente === 'Producao' && situacaoCancelamento(nota, agora) === 'fora_do_prazo'
}

export function normalizarContador(bruto: string): { ok: true; contador: string } | { ok: false; error: string } {
  const contador = bruto.trim()
  if (!contador) return { ok: false, error: 'Informe o contador que fez o pedido à SEFAZ' }
  return { ok: true, contador }
}

export function limiteCancelamento(dataAutorizacao: string): Date {
  return new Date(new Date(dataAutorizacao).getTime() + PRAZO_CANCELAMENTO_MS)
}

/**
 * Só a nota que valeu na SEFAZ desfaz o faturamento: sem data de autorização,
 * "Cancelada" é o cancelamento lógico de uma negada. Homologação nunca faturou.
 */
export function deveDesfazerFaturamento(nota: { status: string; ambiente: string; dataAutorizacao: string | null }): boolean {
  return nota.status === 'Cancelada' && nota.ambiente === 'Producao' && !!nota.dataAutorizacao
}

/**
 * O que a resposta da API faz com a venda. Só na troca de status: consultar de
 * novo uma nota que já estava autorizada ou cancelada não desfaz uma correção
 * feita à mão na venda ou na moto.
 */
export function efeitoNaVenda(
  statusAntes: string | null,
  nota: { status: string; ambiente: string; dataAutorizacao: string | null },
): 'faturar' | 'desfazer' | null {
  if (nota.status === statusAntes || nota.ambiente !== 'Producao') return null
  if (nota.status === 'Autorizada') return 'faturar'
  return deveDesfazerFaturamento(nota) ? 'desfazer' : null
}

export type TravaDoCancelamento =
  'emissao_em_andamento' | 'cancelar_nf' | 'cancelamento_em_andamento' | 'tentar_de_novo' | 'fora_do_prazo' | 'sem_data'

/**
 * Trava do "Cancelar venda" (ADR-0014), com a nota que trava. Só a nota de
 * produção viva trava: a de homologação nunca valeu na SEFAZ, e a morta não vale
 * mais. O índice de nota única deixa no máximo uma viva por venda.
 */
export function travaDoCancelamentoDaVenda<N extends { ambiente: string; status: string; dataAutorizacao: string | null }>(
  notas: N[],
  agora: Date,
): { trava: TravaDoCancelamento; nota: N } | null {
  const nota = notas.find(n => n.ambiente === 'Producao' && !STATUS_MORTOS.includes(n.status))
  if (!nota) return null
  const situacao = situacaoCancelamento(nota, agora)
  const trava: TravaDoCancelamento =
    situacao === 'disponivel' ? (nota.status === 'CancelamentoNegado' ? 'tentar_de_novo' : 'cancelar_nf')
    : situacao === 'em_andamento' ? 'cancelamento_em_andamento'
    : situacao === 'indisponivel' ? 'emissao_em_andamento'
    : situacao
  return { trava, nota }
}
