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
  // Saída do caixa da loja que não é gasto: "Depósito" leva a gaveta pro banco.
  | 'caixa_nao_despesa'
  // Dinheiro devolvido ao cliente (sinal, venda desfeita, cobrança a maior). É
  // saída real, mas não é custo de operar: a entrada correspondente já foi
  // contada como receita e o estorno apenas a desfaz. Somar dos dois lados
  // faria a loja "gastar" um dinheiro que nunca foi dela.
  | 'estorno_cliente'

export type SaidaBanco = {
  valor: string | number
  categoria: string | null
  favorecidoNome: string | null
  descricao: string | null
  /** null = despesa geral da empresa, sem loja atribuída no Importar do Banco. */
  lojaId?: string | null
}

export type ConfigDespesas = {
  /** Categorias com conta_como_despesa = false. */
  categoriasForaDoCalculo: Set<string>
  /** CNPJ (só dígitos) → motivo, vindo de favorecidos_nao_operacionais. */
  cnpjsForaDoCalculo: Map<string, MotivoForaDoCalculo>
  /** Categorias de CAIXA com conta_como_despesa = false (ex.: "Depósito"). */
  categoriasCaixaForaDoCalculo?: Set<string>
  /**
   * Categoria → por que ela fica fora. Sem isto tudo cai em 'categoria_marcada'
   * e não dá pra separar retirada de sócio de compra de mercadoria.
   */
  motivoPorCategoria?: Map<string, MotivoForaDoCalculo>
}

/**
 * Saída de dinheiro do caixa da loja, lançada pelo administrativo em /caixa.
 * Nunca aparece no extrato — o dinheiro sai da gaveta —, então sem isto a
 * despesa paga em espécie some do resultado.
 */
export type SaidaCaixa = {
  valor: string | number
  categoria: string
  lojaId?: string | null
}

export function soDigitos(s: string): string {
  return s.replace(/\D/g, '')
}

/**
 * Chave de comparação de categoria: sem caixa e sem espaço nas pontas.
 *
 * O catálogo e o lançamento nem sempre têm a mesma grafia — "Estorno ao Cliente"
 * no cadastro e "Estorno ao CLIENTE" no extrato. Com casamento exato, a
 * categoria ficava marcada como não-operacional e mesmo assim entrava no custo.
 */
export function chaveCategoria(nome: string): string {
  return nome.trim().toLowerCase()
}

/** A categoria está no conjunto, ignorando caixa e espaços? */
export function temCategoria(conjunto: Set<string>, categoria: string): boolean {
  const alvo = chaveCategoria(categoria)
  for (const c of conjunto) if (chaveCategoria(c) === alvo) return true
  return false
}

/** Motivo cadastrado para a categoria; 'categoria_marcada' quando não há um. */
export function motivoDaCategoria(
  mapa: Map<string, MotivoForaDoCalculo> | undefined,
  categoria: string,
): MotivoForaDoCalculo {
  if (!mapa) return 'categoria_marcada'
  const alvo = chaveCategoria(categoria)
  for (const [nome, motivo] of mapa) if (chaveCategoria(nome) === alvo) return motivo
  return 'categoria_marcada'
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
  if (saida.categoria && temCategoria(config.categoriasForaDoCalculo, saida.categoria)) {
    return motivoDaCategoria(config.motivoPorCategoria, saida.categoria)
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
  /** Chave = lojaId; `null` junta tudo que não tem loja atribuída. */
  porLoja: Map<string | null, number>
  /**
   * Só o que NÃO tem loja atribuída, quebrado por categoria. É a maior fatia da
   * despesa e a mais opaca — sem isso, "Geral (Empresa)" é um número só.
   */
  porCategoriaGeral: { categoria: string; total: number }[]
  /**
   * O mesmo detalhe, mas de cada loja: lojaId → categorias, da maior pra menor.
   * `porLoja` responde quanto a loja gastou; isto responde em quê.
   */
  porCategoriaPorLoja: Map<string, { categoria: string; total: number }[]>
  /**
   * O que saiu do cálculo, quebrado por categoria e motivo. Permite montar o
   * quadro de retiradas sem chumbar nome de sócio no código.
   */
  foraPorCategoria: { categoria: string; motivo: MotivoForaDoCalculo; total: number }[]
}

const SEM_CATEGORIA = 'Sem categoria'

/**
 * Soma as saídas do banco + os lançamentos manuais que não vieram do banco.
 * `manuais` já deve chegar filtrado: só os sem vínculo com despesas_open_finance.
 */
export function somarDespesas(
  saidasBanco: SaidaBanco[],
  manuais: { valor: string | number; categoria: string; lojaId?: string | null }[],
  config: ConfigDespesas,
  caixa: SaidaCaixa[] = [],
): TotalDespesas {
  const porCategoria = new Map<string, number>()
  const porCategoriaGeral = new Map<string, number>()
  const porLoja = new Map<string | null, number>()
  const porLojaCategoria = new Map<string, Map<string, number>>()
  const foraDoCalculo: Record<MotivoForaDoCalculo, number> = {
    compra_moto: 0,
    retirada_socio: 0,
    categoria_marcada: 0,
    transferencia_interna: 0,
    caixa_nao_despesa: 0,
    estorno_cliente: 0,
  }
  let total = 0

  // Uma categoria só tem um motivo, então ela basta como chave — nada de
  // concatenar motivo+categoria numa string e ter que desfazer o parse depois.
  const foraPorCategoria = new Map<string, { motivo: MotivoForaDoCalculo; total: number }>()
  const registrarFora = (motivo: MotivoForaDoCalculo, categoria: string | null, valor: number) => {
    foraDoCalculo[motivo] += valor
    const chave = categoria || SEM_CATEGORIA
    const atual = foraPorCategoria.get(chave)
    if (atual) atual.total += valor
    else foraPorCategoria.set(chave, { motivo, total: valor })
  }

  const somar = (categoria: string, lojaId: string | null, valor: number) => {
    total += valor
    porCategoria.set(categoria, (porCategoria.get(categoria) ?? 0) + valor)
    porLoja.set(lojaId, (porLoja.get(lojaId) ?? 0) + valor)
    if (lojaId === null) {
      porCategoriaGeral.set(categoria, (porCategoriaGeral.get(categoria) ?? 0) + valor)
    } else {
      const daLoja = porLojaCategoria.get(lojaId) ?? new Map<string, number>()
      daLoja.set(categoria, (daLoja.get(categoria) ?? 0) + valor)
      porLojaCategoria.set(lojaId, daLoja)
    }
  }

  for (const s of saidasBanco) {
    const motivo = motivoForaDoCalculo(s, config)
    const valor = valorDespesa(s.valor)
    if (motivo) {
      registrarFora(motivo, s.categoria, valor)
      continue
    }
    somar(s.categoria || SEM_CATEGORIA, s.lojaId ?? null, valor)
  }

  for (const m of manuais) {
    // O lançamento manual não tem favorecido nem descrição de extrato — só a categoria
    // pode tirá-lo do cálculo.
    if (temCategoria(config.categoriasForaDoCalculo, m.categoria)) {
      const motivo = motivoDaCategoria(config.motivoPorCategoria, m.categoria)
      registrarFora(motivo, m.categoria, valorDespesa(m.valor))
      continue
    }
    somar(m.categoria || SEM_CATEGORIA, m.lojaId ?? null, valorDespesa(m.valor))
  }

  // Dinheiro pago da gaveta. Não passa pelas regras de CNPJ/descrição — o caixa não
  // tem favorecido nem histórico de extrato, só a categoria diz o que é.
  const caixaFora = config.categoriasCaixaForaDoCalculo ?? new Set<string>()
  for (const c of caixa) {
    if (caixaFora.has(c.categoria)) {
      registrarFora('caixa_nao_despesa', c.categoria, valorDespesa(c.valor))
      continue
    }
    somar(c.categoria || SEM_CATEGORIA, c.lojaId ?? null, valorDespesa(c.valor))
  }

  return {
    total,
    porCategoria: [...porCategoria.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
    foraDoCalculo,
    porLoja,
    porCategoriaGeral: [...porCategoriaGeral.entries()]
      .map(([categoria, total]) => ({ categoria, total }))
      .sort((a, b) => b.total - a.total),
    porCategoriaPorLoja: new Map(
      [...porLojaCategoria.entries()].map(([lojaId, cats]) => [
        lojaId,
        [...cats.entries()]
          .map(([categoria, total]) => ({ categoria, total }))
          .sort((a, b) => b.total - a.total),
      ]),
    ),
    foraPorCategoria: [...foraPorCategoria.entries()]
      .map(([categoria, { motivo, total }]) => ({ categoria, motivo, total }))
      .sort((a, b) => b.total - a.total),
  }
}
