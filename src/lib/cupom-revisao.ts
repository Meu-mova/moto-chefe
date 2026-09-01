// Cupom de revisão gratuita.
//
// Emissão é sempre MANUAL, pelo módulo /cupons — vender moto não gera cupom
// sozinho (decisão do Cesar em 01/09/2026). O resgate acontece na tela de
// pagamento da OS: o operador escolhe a forma "Cupom de revisão" e digita o
// código, e o cupom abate a MÃO DE OBRA da OS. Peça e óleo o cliente paga.
//
// As regras moram aqui, puras, para poderem ser provadas sem banco — ver
// cupom-revisao.test.ts. O I/O fica em src/app/(dashboard)/cupons/actions.ts.

/** Tipo gravado no array `pagamentos` da OS. Não precisa conciliar: não é dinheiro. */
export const TIPO_PAGAMENTO_CUPOM = 'cupom_revisao'

// Sem O/0, I/1 e S/5: o código é lido de um papel no balcão e ditado por telefone.
const ALFABETO = 'ABCDEFGHJKLMNPQRTUVWXYZ2346789'

export function gerarCodigoCupom(rnd: () => number = Math.random): string {
  let corpo = ''
  for (let i = 0; i < 6; i++) corpo += ALFABETO[Math.floor(rnd() * ALFABETO.length)]
  return `REV-${corpo}`
}

/**
 * Aceita o que a pessoa digitar: com ou sem o prefixo, com hífen ou sem,
 * minúsculo, com espaço colado. Devolve sempre a forma canônica 'REV-XXXXXX'.
 */
export function normalizarCodigoCupom(v: string | null | undefined): string {
  const bruto = (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  const corpo = bruto.startsWith('REV') ? bruto.slice(3) : bruto
  return corpo ? `REV-${corpo}` : ''
}

export type StatusCupom = 'ativo' | 'usado' | 'cancelado' | 'vencido'

export type CupomEstado = {
  status: string
  /** 'YYYY-MM-DD' — comparado como texto, que ordena igual à data e não pega fuso. */
  validoAte: string
  osId: string | null
}

/**
 * Status para exibição.
 *
 * 'vencido' NÃO é gravado no banco: sai da comparação com `validoAte`. Se fosse
 * coluna, dependeria de alguém rodar um job todo dia para a lista ficar honesta —
 * e no dia em que o job falhasse a tela mostraria cupom vencido como ativo.
 */
export function statusCupom(c: CupomEstado, hoje: string): StatusCupom {
  if (c.status === 'usado') return 'usado'
  if (c.status === 'cancelado') return 'cancelado'
  return c.validoAte < hoje ? 'vencido' : 'ativo'
}

export type ContextoResgate = {
  hoje: string
  osId: string
  /** Mão de obra da OS (ordens_servico.valor_servicos). É o teto do abatimento. */
  valorServicos: number
}

/**
 * Motivo pelo qual o cupom não pode ser resgatado nesta OS, ou `null` se pode.
 *
 * Cupom já usado NA PRÓPRIA OS passa: reabrir o pagamento de uma OS que já foi
 * fechada com cupom é rotina (corrigir a forma do troco, por exemplo) e não pode
 * acusar "já utilizado" contra ela mesma.
 */
export function motivoCupomInvalido(c: CupomEstado | null, ctx: ContextoResgate): string | null {
  if (!c) return 'Cupom não encontrado'
  if (c.status === 'cancelado') return 'Cupom cancelado'
  if (c.status === 'usado' && c.osId !== ctx.osId) return 'Cupom já utilizado em outra OS'
  if (c.validoAte < ctx.hoje) return `Cupom vencido em ${formatarData(c.validoAte)}`
  if (ctx.valorServicos < 0.01) return 'Esta OS não tem mão de obra para o cupom cobrir'
  return null
}

/** Quanto o cupom abate: toda a mão de obra da OS, nunca as peças. */
export function valorAbatidoPeloCupom(valorServicos: number): number {
  return Math.max(0, Number(valorServicos) || 0)
}

/** Validade padrão sugerida ao emitir: 6 meses. */
export function validadePadrao(hoje: string, meses = 6): string {
  const [ano, mes, dia] = hoje.slice(0, 10).split('-').map(Number)
  // Date.UTC evita o fuso; dia 31 em mês curto transborda para o mês seguinte, que
  // é o comportamento esperado de "daqui a N meses" num prazo de cortesia.
  const d = new Date(Date.UTC(ano, mes - 1 + meses, dia))
  return d.toISOString().slice(0, 10)
}

function formatarData(d: string) {
  const [ano, mes, dia] = d.slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}
