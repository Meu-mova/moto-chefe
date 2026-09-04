// ─── Fatura de cartão de crédito lida do Open Finance ────────────────────────
//
// Ler os lançamentos é fácil; dizer a QUE FATURA cada um pertence é que não é.
// O provedor não resolve isso: `openfinance_get_credit_card_bill` com
// include_transactions devolveu 1 linha (o pagamento) para uma fatura de
// R$ 27.970,37 — as compras não vêm amarradas ao bill_id.
//
// Quem responde é o próprio lançamento, em creditCardMetadata.billForecastDate,
// e só nas faturas recentes: em 04/09/2026 eram 168 de 616 lançamentos. Para o
// resto sobra a regra do ciclo, que este arquivo aplica em ordem:
//
//   1. billForecastDate, quando o provedor disse;
//   2. a janela de fechamento, quando as faturas conhecidas dão o intervalo;
//   3. o ciclo padrão (fecha no dia 1º, vence no 11) como último recurso.
//
// Puro e testado de propósito: é a única parte disso que dá para provar sem o
// banco na frente, e é onde um erro vira gasto na fatura errada.

/** Lançamento como o mcp.ai devolve (só os campos que interessam aqui). */
export type LancamentoBruto = {
  id: string
  date: string
  description: string
  /** Já vem com sinal: positivo é gasto, negativo é pagamento/estorno. */
  amount: string
  category?: string | null
  status?: string | null
  creditCardMetadata?: {
    cardNumber?: string | null
    billForecastDate?: string | null
  } | null
}

/** Fatura como o mcp.ai devolve. */
export type FaturaBruta = {
  id: string
  dueDate: string
  totalAmount: string
  billClosingDate?: string | null
}

export type Lancamento = {
  id: string
  /** 'YYYY-MM-DD' */
  data: string
  descricao: string
  /** Positivo é gasto, negativo é pagamento da fatura ou estorno. */
  valor: number
  categoria: string | null
  /** Final do cartão. null quando o lançamento não diz de qual cartão saiu. */
  cartao: string | null
  /** Lançamento ainda não fechado na fatura. */
  pendente: boolean
}

export type BlocoCartao = {
  cartao: string | null
  /** Só o que é gasto — pagamento e estorno ficam de fora. */
  totalGasto: number
  /** Pagamentos e estornos, como número positivo. Zero quando não houve. */
  totalCredito: number
  lancamentos: Lancamento[]
}

export type Fatura = {
  /** 'YYYY-MM' do mês em que a fatura vence. É a chave da tela. */
  ref: string
  /** 'YYYY-MM-DD'. null na fatura montada só pela regra do ciclo. */
  vencimento: string | null
  fechamento: string | null
  /** O que o banco diz que é o total. null na fatura ainda em aberto. */
  totalBanco: number | null
  /** Soma dos gastos que o Open Finance detalhou. */
  totalGasto: number
  cartoes: BlocoCartao[]
}

/** "-14234.60" → -14234.6 */
function paraNumero(v: string): number {
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : 0
}

function mesDe(dataISO: string): string {
  return dataISO.slice(0, 7)
}

/**
 * Mês seguinte ao de uma data 'YYYY-MM-DD' ou 'YYYY-MM', em 'YYYY-MM'.
 *
 * Aritmética em string, sem Date: `new Date('2026-01-31')` mais um mês cai em
 * março, e aqui o dia não importa — só o mês.
 */
function mesSeguinte(data: string): string {
  const ano = Number(data.slice(0, 4))
  const mes = Number(data.slice(5, 7))
  return mes === 12 ? `${ano + 1}-01` : `${ano}-${String(mes + 1).padStart(2, '0')}`
}

/** Mesmo dia do mês anterior, em 'YYYY-MM-DD'. Serve de piso de janela. */
function umMesAntes(data: string): string {
  const ano = Number(data.slice(0, 4))
  const mes = Number(data.slice(5, 7))
  const dia = data.slice(8, 10)
  return mes === 1 ? `${ano - 1}-12-${dia}` : `${ano}-${String(mes - 1).padStart(2, '0')}-${dia}`
}

export function normalizarLancamento(l: LancamentoBruto): Lancamento {
  return {
    id: l.id,
    data: l.date.slice(0, 10),
    descricao: l.description,
    valor: paraNumero(l.amount),
    categoria: l.category ?? null,
    cartao: l.creditCardMetadata?.cardNumber || null,
    pendente: l.status === 'PENDING',
  }
}

/**
 * A que fatura ('YYYY-MM' do vencimento) esta compra pertence.
 *
 * `faturas` precisa vir ordenada por vencimento crescente. A janela de uma
 * fatura é (fechamento da anterior, fechamento dela]: compra do dia do
 * fechamento ainda entra, compra do dia seguinte já é da próxima.
 */
export function refDaFatura(
  data: string,
  forecast: string | null | undefined,
  faturas: FaturaBruta[],
): string {
  if (forecast) return forecast.slice(0, 7)

  let fechamentoAnterior: string | null = null
  for (const f of faturas) {
    const fecha = f.billClosingDate?.slice(0, 10)
    if (!fecha) continue
    // A fatura mais antiga conhecida também precisa de piso. Sem ele a janela
    // dela fica aberta para trás e engole todo o histórico: 383 lançamentos e
    // R$ 42 mil caíram numa fatura de R$ 3.197,31 quando isso faltou. O piso é
    // um mês antes do fechamento, que é o tamanho do ciclo.
    const piso = fechamentoAnterior ?? umMesAntes(fecha)
    if (data > piso && data <= fecha) return mesDe(f.dueDate)
    fechamentoAnterior = fecha
  }

  // Ciclo padrão do cartão: fecha no dia 1º e vence no 11 do mesmo mês. Compra
  // do dia 1º ainda cai na fatura deste mês; do dia 2 em diante, na do mês que
  // vem. Só chega aqui compra velha, de fatura que o banco não devolve mais.
  return data.slice(8, 10) === '01' ? mesDe(data) : mesSeguinte(data)
}

/** Agrupa por cartão, do que mais gastou para o que menos gastou. */
export function agruparPorCartao(lancamentos: Lancamento[]): BlocoCartao[] {
  const porCartao = new Map<string, Lancamento[]>()
  for (const l of lancamentos) {
    const chave = l.cartao ?? ''
    porCartao.set(chave, [...(porCartao.get(chave) ?? []), l])
  }

  return [...porCartao.entries()]
    .map(([chave, itens]) => ({
      cartao: chave === '' ? null : chave,
      // Gasto e crédito separados: somar tudo junto esconderia uma fatura de
      // R$ 30 mil atrás de um pagamento de R$ 30 mil e mostraria "zero gasto".
      totalGasto: itens.filter(i => i.valor > 0).reduce((s, i) => s + i.valor, 0),
      totalCredito: itens.filter(i => i.valor < 0).reduce((s, i) => s - i.valor, 0),
      lancamentos: [...itens].sort((a, b) => b.data.localeCompare(a.data) || b.valor - a.valor),
    }))
    .sort((a, b) => b.totalGasto - a.totalGasto)
}

/**
 * Monta as faturas a partir dos lançamentos, da mais nova para a mais velha.
 *
 * Aparece fatura que o banco não listou (a em aberto, e as velhas que saíram do
 * histórico dele): é proposital, porque o lançamento existe e tem que ser
 * visto. Nessas, `totalBanco` fica null e a tela mostra só a soma.
 */
export function agruparEmFaturas(
  lancamentosBrutos: LancamentoBruto[],
  faturasBrutas: FaturaBruta[],
): Fatura[] {
  const faturas = [...faturasBrutas].sort((a, b) => a.dueDate.localeCompare(b.dueDate))
  const porRef = new Map<string, Lancamento[]>()

  for (const bruto of lancamentosBrutos) {
    const l = normalizarLancamento(bruto)
    const ref = refDaFatura(l.data, bruto.creditCardMetadata?.billForecastDate, faturas)
    porRef.set(ref, [...(porRef.get(ref) ?? []), l])
  }

  const dadosDoBanco = new Map(faturas.map(f => [mesDe(f.dueDate), f]))

  return [...porRef.entries()]
    .map(([ref, itens]) => {
      const doBanco = dadosDoBanco.get(ref)
      const cartoes = agruparPorCartao(itens)
      return {
        ref,
        vencimento: doBanco?.dueDate.slice(0, 10) ?? null,
        fechamento: doBanco?.billClosingDate?.slice(0, 10) ?? null,
        totalBanco: doBanco ? paraNumero(doBanco.totalAmount) : null,
        totalGasto: cartoes.reduce((s, c) => s + c.totalGasto, 0),
        cartoes,
      }
    })
    .sort((a, b) => b.ref.localeCompare(a.ref))
}
