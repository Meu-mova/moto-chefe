// Decide o que entra no card "Despesas Operacionais" do /financeiro.
//
// A base virou o Importar do Banco (todas as saídas das lojas), mais os lançamentos
// manuais de contas pagas fora da conta do Open Finance. Duas armadilhas:
//
//   1. Dobra — quase todo lançamento manual NASCEU de uma saída do banco (o botão
//      "lançar" cria a linha em `despesas` e guarda o vínculo em
//      despesas_open_finance.despesa_id). Somar as duas tabelas inteiras contaria
//      essas duas vezes. O filtro certo é o vínculo, não o valor.
//   2. Nem toda saída é custo de operar a loja — compra de moto é mercadoria (o custo
//      já está no líquido da venda) e retirada de sócio é distribuição de lucro.

export type MotivoForaDoCalculo =
  | 'compra_moto'
  | 'retirada_socio'
  | 'categoria_marcada'
  // PIX entre os CNPJs do próprio grupo (BH → Sul de Minas e vice-versa). Sai do caixa
  // de uma empresa e entra no da outra — contando dos dois lados, o grupo "gasta" um
  // dinheiro que nunca saiu do grupo.
  | 'transferencia_interna'

export type SaidaBanco = {
  valor: string | number
  categoria: string | null
  favorecidoNome: string | null
  descricao: string | null
}

export type ConfigDespesas = {
  /** Categorias com conta_como_despesa = false. */
  categoriasForaDoCalculo: Set<string>
  /** CNPJ (só dígitos) → motivo, vindo de favorecidos_nao_operacionais. */
  cnpjsForaDoCalculo: Map<string, MotivoForaDoCalculo>
}

export function soDigitos(s: string): string {
  return s.replace(/\D/g, '')
}

// "Retirada Cesar abril", "RETIRADA DE LUCRO" — o extrato costuma dizer na descrição
// mesmo quando ninguém categorizou a saída no Importar do Banco.
const RETIRADA_RE = /\bretirad[ao]s?\b/i

/**
 * Devolve o motivo de a saída ficar fora do card, ou null se ela é despesa operacional.
 */
export function motivoForaDoCalculo(
  saida: SaidaBanco,
  config: ConfigDespesas,
): MotivoForaDoCalculo | null {
  if (saida.categoria && config.categoriasForaDoCalculo.has(saida.categoria)) {
    return 'categoria_marcada'
  }

  // O CNPJ aparece formatado de um jeito no favorecido ("53.780.554 0001-15") e de outro
  // no meio da descrição do PIX, então comparo só os dígitos dos dois campos juntos.
  const digitos = soDigitos(`${saida.favorecidoNome ?? ''}${saida.descricao ?? ''}`)
  for (const [cnpj, motivo] of config.cnpjsForaDoCalculo) {
    if (cnpj && digitos.includes(cnpj)) return motivo
  }

  if (saida.descricao && RETIRADA_RE.test(saida.descricao)) return 'retirada_socio'

  return null
}

// Quem lança à mão às vezes digita o valor sem o sinal: 25 dos lançamentos estão
// positivos enquanto o extrato vem todo negativo. Somar o valor cru faria esses
// ABATEREM da despesa em vez de somar.
export function valorDespesa(valor: string | number): number {
  return Math.abs(Number(valor))
}

export type TotalDespesas = {
  total: number
  porCategoria: { categoria: string; total: number }[]
  foraDoCalculo: Record<MotivoForaDoCalculo, number>
}

const SEM_CATEGORIA = 'Sem categoria'

/**
 * Soma as saídas do banco + os lançamentos manuais que não vieram do banco.
 * `manuais` já deve chegar filtrado: só os sem vínculo com despesas_open_finance.
 */
export function somarDespesas(
  saidasBanco: SaidaBanco[],
  manuais: { valor: string | number; categoria: string }[],
  config: ConfigDespesas,
): TotalDespesas {
  const porCategoria = new Map<string, number>()
  const foraDoCalculo: Record<MotivoForaDoCalculo, number> = {
    compra_moto: 0,
    retirada_socio: 0,
    categoria_marcada: 0,
    transferencia_interna: 0,
  }
  let total = 0

  const somar = (categoria: string, valor: number) => {
    total += valor
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + valor)
  }

  for (const s of saidasBanco) {
    const motivo = motivoForaDoCalculo(s, config)
    const valor = valorDespesa(s.valor)
    if (motivo) {
      foraDoCalculo[motivo] += valor
      continue
    }
    somar(s.categoria || SEM_CATEGORIA, valor)
  }

  for (const m of manuais) {
    // O lançamento manual não tem favorecido nem descrição de extrato — só a categoria
    // pode tirá-lo do cálculo.
    if (config.categoriasForaDoCalculo.has(m.categoria)) {
      foraDoCalculo.categoria_marcada += valorDespesa(m.valor)
      continue
    }
    somar(m.categoria || SEM_CATEGORIA, valorDespesa(m.valor))
  }

  return {
    total,
    porCategoria: [...porCategoria.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
    foraDoCalculo,
  }
}
