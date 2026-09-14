import { db, execRows } from '@/lib/db'
import {
  vendas, lojas, motos, ordensServico, vendasPecas, conciliacoesCartao,
  despesas, despesasOpenFinance, categoriasDespesa,
  lancamentosCaixa,
} from '@/lib/db/schema'
import { and, eq, gte, inArray, lt, ne, sql } from 'drizzle-orm'
import { valorLiquidoExpr } from './valor-liquido'
import { somaCustoMotoExpr } from './custo-moto'
import { somarDespesas, type TotalDespesas } from '@/lib/despesas-operacionais'
import { configDespesas } from './config-despesas'
import { grupoOuOutras, somarEntradas, type EntradaDre, type GrupoDre, ENTRADA_VAZIA } from '@/lib/dre'

/**
 * Os números do DRE. Nada de regra nova aqui: as mesmas consultas do /financeiro,
 * sem o filtro de loja (o DRE quebra por loja em vez de filtrar) e agrupadas por
 * grupo do DRE em vez de por categoria.
 *
 * A visão de 12 meses NÃO repete a consulta doze vezes: busca o período inteiro
 * e agrupa em memória. Doze rodadas de meia dúzia de consultas cada derrubam o
 * pooler — ver [[feedback_entregar_rapido]].
 */

const bordas = (ano: number, mes: number) => ({
  inicio: new Date(Date.UTC(ano, mes - 1, 1)),
  fim: new Date(Date.UTC(ano, mes, 1)),
})

/**
 * Categoria → grupo do DRE, comparando por nome normalizado.
 *
 * Nome é a única chave disponível: a despesa do extrato e o lançamento de caixa
 * guardam a categoria como texto, não por id. Categoria de caixa que não existe
 * no catálogo de despesa (hoje "Luz" e "Material escritório") não tem grupo e cai
 * em Outras — a tela lista quem caiu lá, para não virar buraco silencioso.
 */
async function mapaGrupoPorCategoria() {
  const linhas = await db
    .select({ nome: categoriasDespesa.nome, grupo: categoriasDespesa.grupoDre })
    .from(categoriasDespesa)
  return new Map(linhas.map(l => [l.nome.trim().toLowerCase(), grupoOuOutras(l.grupo)]))
}

function agruparDespesas(
  porCategoria: { categoria: string; total: number }[],
  mapa: Map<string, GrupoDre>,
) {
  const porGrupo: Partial<Record<GrupoDre, number>> = {}
  const semGrupo: string[] = []
  for (const c of porCategoria) {
    const chave = c.categoria.trim().toLowerCase()
    const grupo = mapa.get(chave)
    if (grupo === undefined) semGrupo.push(c.categoria)
    const destino = grupo ?? 'outras'
    porGrupo[destino] = (porGrupo[destino] ?? 0) + c.total
  }
  return { porGrupo, semGrupo }
}

function memorandoDe(resumo: TotalDespesas) {
  return {
    retiradasSocios:        resumo.foraDoCalculo.retirada_socio,
    compraMercadoria:       resumo.foraDoCalculo.compra_moto,
    transferenciasInternas: resumo.foraDoCalculo.transferencia_interna,
    estornosCliente:        resumo.foraDoCalculo.estorno_cliente,
  }
}

// ─── Visão por loja, de um mês ───────────────────────────────────────────────

export type ColunaDre = { chave: string; rotulo: string; entrada: EntradaDre }

export async function dreDoMes(opts: {
  grupoId: string
  lojaIds: string[]
  ano: number
  mes: number
}): Promise<{ colunas: ColunaDre[]; semGrupo: string[] }> {
  const { grupoId, lojaIds, ano, mes } = opts
  if (lojaIds.length === 0) return { colunas: [], semGrupo: [] }
  const { inicio, fim } = bordas(ano, mes)

  const [nomes, porLojaVendas, porLojaOS, porLojaPecas, taxaOutras, resumo, mapa] = await Promise.all([
    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).where(inArray(lojas.id, lojaIds)),

    db.select({
        lojaId: vendas.lojaId,
        bruto:   sql<string>`COALESCE(SUM(${vendas.valor}::numeric), 0)`,
        liquido: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), 0)`,
        // Mesmo custo do /financeiro, com a queda para a precificação: o
        // resultado operacional do DRE tem que bater com o Lucro Líquido de lá.
        custo:   sql<string>`${somaCustoMotoExpr()}`,
      })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .where(and(inArray(vendas.lojaId, lojaIds), gte(vendas.dataVenda, inicio), lt(vendas.dataVenda, fim)))
      .groupBy(vendas.lojaId),

    db.select({
        lojaId:    ordensServico.lojaId,
        servicos:  sql<string>`COALESCE(SUM(${ordensServico.valorServicos}::numeric), 0)`,
        pecas:     sql<string>`COALESCE(SUM(${ordensServico.valorPecas}::numeric), 0)`,
      })
      .from(ordensServico)
      .where(and(
        eq(ordensServico.status, 'concluida'),
        inArray(ordensServico.lojaId, lojaIds),
        gte(ordensServico.dataConclusao, inicio),
        lt(ordensServico.dataConclusao, fim),
      ))
      .groupBy(ordensServico.lojaId),

    db.select({
        lojaId: vendasPecas.lojaId,
        total:  sql<string>`COALESCE(SUM(${vendasPecas.valorTotal}::numeric), 0)`,
      })
      .from(vendasPecas)
      .where(and(
        inArray(vendasPecas.lojaId, lojaIds),
        gte(vendasPecas.dataVenda, inicio),
        lt(vendasPecas.dataVenda, fim),
      ))
      .groupBy(vendasPecas.lojaId),

    // Taxa de cartão de OS e peça, por loja. A de moto sai de bruto − líquido.
    execRows(sql`
      SELECT loja_id,
             COALESCE(SUM(taxa), 0)::text AS taxa
        FROM (
          SELECT o.loja_id,
                 c.valor_bruto::numeric - COALESCE(c.valor_liquido::numeric, c.valor_bruto::numeric) AS taxa
            FROM ${conciliacoesCartao} c
            JOIN ${ordensServico} o ON o.id = c.os_id
           WHERE c.conciliado = true
             AND o.status = 'concluida'
             AND o.data_conclusao >= ${inicio.toISOString()} AND o.data_conclusao < ${fim.toISOString()}
          UNION ALL
          SELECT p.loja_id,
                 c.valor_bruto::numeric - COALESCE(c.valor_liquido::numeric, c.valor_bruto::numeric) AS taxa
            FROM ${conciliacoesCartao} c
            JOIN ${vendasPecas} p ON p.id = c.peca_venda_id
           WHERE c.conciliado = true
             AND p.data_venda >= ${inicio.toISOString()} AND p.data_venda < ${fim.toISOString()}
        ) t
       GROUP BY loja_id
    `),

    resumoDespesasDoPeriodo(grupoId, lojaIds, inicio, fim),
    mapaGrupoPorCategoria(),
  ])

  const num = (v: unknown) => Number(v ?? 0)
  const idx = <T extends { lojaId: string }>(linhas: T[]) => new Map(linhas.map(l => [l.lojaId, l]))
  const vendasPorLoja = idx(porLojaVendas)
  const osPorLoja = idx(porLojaOS)
  const pecasPorLoja = idx(porLojaPecas)
  const taxaPorLoja = new Map(
    (taxaOutras as { loja_id: string; taxa: string }[]).map(r => [r.loja_id, num(r.taxa)]),
  )

  const semGrupo = new Set<string>()
  const colunas: ColunaDre[] = []

  for (const loja of nomes) {
    const v = vendasPorLoja.get(loja.id)
    const os = osPorLoja.get(loja.id)
    const pecas = pecasPorLoja.get(loja.id)
    const despesasDaLoja = resumo.porCategoriaPorLoja.get(loja.id) ?? []
    const { porGrupo, semGrupo: faltando } = agruparDespesas(despesasDaLoja, mapa)
    faltando.forEach(c => semGrupo.add(c))

    const bruto = num(v?.bruto)
    const entrada: EntradaDre = {
      receitaMotos: bruto,
      receitaServicos: num(os?.servicos),
      receitaPecas: num(pecas?.total) + num(os?.pecas),
      taxasCartao: bruto - num(v?.liquido) + (taxaPorLoja.get(loja.id) ?? 0),
      cmvMotos: num(v?.custo),
      despesasPorGrupo: porGrupo,
    }
    // Loja sem nada no mês não vira coluna vazia na tabela.
    const temMovimento = entrada.receitaMotos > 0 || entrada.receitaServicos > 0
      || entrada.receitaPecas > 0 || Object.keys(porGrupo).length > 0
    if (temMovimento) colunas.push({ chave: loja.id, rotulo: loja.nome, entrada })
  }

  // Geral (Empresa): despesa sem loja atribuída. Não tem receita — venda, OS e
  // peça pertencem sempre a uma loja.
  const { porGrupo: grupoGeral, semGrupo: faltandoGeral } = agruparDespesas(resumo.porCategoriaGeral, mapa)
  faltandoGeral.forEach(c => semGrupo.add(c))
  if (Object.keys(grupoGeral).length > 0) {
    colunas.push({
      chave: '__geral',
      rotulo: 'Geral (Empresa)',
      entrada: { ...ENTRADA_VAZIA, despesasPorGrupo: grupoGeral },
    })
  }

  // O memorando é do grupo inteiro (o motivo não guarda loja), então vai na
  // última coluna, o TOTAL — montado pela página com somarEntradas.
  return { colunas, semGrupo: [...semGrupo] }
}

/** Memorando do mês inteiro, para a coluna TOTAL. */
export async function memorandoDoMes(grupoId: string, lojaIds: string[], ano: number, mes: number) {
  const { inicio, fim } = bordas(ano, mes)
  return memorandoDe(await resumoDespesasDoPeriodo(grupoId, lojaIds, inicio, fim))
}

// ─── Visão de evolução: N meses, consolidado do grupo ────────────────────────

export type MesDre = { ano: number; mes: number; entrada: EntradaDre }

export async function dreEvolucao(opts: {
  grupoId: string
  lojaIds: string[]
  /** Mês final (inclusive). */
  ano: number
  mes: number
  meses: number
}): Promise<MesDre[]> {
  const { grupoId, lojaIds, ano, mes, meses } = opts
  if (lojaIds.length === 0) return []

  const inicio = new Date(Date.UTC(ano, mes - meses, 1))
  const fim = new Date(Date.UTC(ano, mes, 1))
  const chaveDe = (d: Date) => `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`

  const [vendasMes, osMes, pecasMes, taxaMes, linhasDespesa, mapa] = await Promise.all([
    db.select({
        mes:     sql<string>`to_char(${vendas.dataVenda} AT TIME ZONE 'UTC', 'YYYY-FMMM')`,
        bruto:   sql<string>`COALESCE(SUM(${vendas.valor}::numeric), 0)`,
        liquido: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), 0)`,
        custo:   sql<string>`${somaCustoMotoExpr()}`,
      })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .where(and(inArray(vendas.lojaId, lojaIds), gte(vendas.dataVenda, inicio), lt(vendas.dataVenda, fim)))
      .groupBy(sql`1`),

    db.select({
        mes:      sql<string>`to_char(${ordensServico.dataConclusao} AT TIME ZONE 'UTC', 'YYYY-FMMM')`,
        servicos: sql<string>`COALESCE(SUM(${ordensServico.valorServicos}::numeric), 0)`,
        pecas:    sql<string>`COALESCE(SUM(${ordensServico.valorPecas}::numeric), 0)`,
      })
      .from(ordensServico)
      .where(and(
        eq(ordensServico.status, 'concluida'),
        inArray(ordensServico.lojaId, lojaIds),
        gte(ordensServico.dataConclusao, inicio),
        lt(ordensServico.dataConclusao, fim),
      ))
      .groupBy(sql`1`),

    db.select({
        mes:   sql<string>`to_char(${vendasPecas.dataVenda} AT TIME ZONE 'UTC', 'YYYY-FMMM')`,
        total: sql<string>`COALESCE(SUM(${vendasPecas.valorTotal}::numeric), 0)`,
      })
      .from(vendasPecas)
      .where(and(
        inArray(vendasPecas.lojaId, lojaIds),
        gte(vendasPecas.dataVenda, inicio),
        lt(vendasPecas.dataVenda, fim),
      ))
      .groupBy(sql`1`),

    execRows(sql`
      SELECT to_char(data AT TIME ZONE 'UTC', 'YYYY-FMMM') AS mes,
             COALESCE(SUM(taxa), 0)::text AS taxa
        FROM (
          SELECT o.data_conclusao AS data,
                 c.valor_bruto::numeric - COALESCE(c.valor_liquido::numeric, c.valor_bruto::numeric) AS taxa
            FROM ${conciliacoesCartao} c
            JOIN ${ordensServico} o ON o.id = c.os_id
           WHERE c.conciliado = true AND o.status = 'concluida'
             AND o.data_conclusao >= ${inicio.toISOString()} AND o.data_conclusao < ${fim.toISOString()}
          UNION ALL
          SELECT p.data_venda AS data,
                 c.valor_bruto::numeric - COALESCE(c.valor_liquido::numeric, c.valor_bruto::numeric) AS taxa
            FROM ${conciliacoesCartao} c
            JOIN ${vendasPecas} p ON p.id = c.peca_venda_id
           WHERE c.conciliado = true
             AND p.data_venda >= ${inicio.toISOString()} AND p.data_venda < ${fim.toISOString()}
        ) t
       GROUP BY 1
    `),

    despesasPorMes(grupoId, lojaIds, inicio, fim),
    mapaGrupoPorCategoria(),
  ])

  const num = (v: unknown) => Number(v ?? 0)
  const porChave = <T extends { mes: string }>(linhas: T[]) => new Map(linhas.map(l => [l.mes, l]))
  const v = porChave(vendasMes)
  const os = porChave(osMes)
  const pc = porChave(pecasMes)
  const tx = new Map((taxaMes as { mes: string; taxa: string }[]).map(r => [r.mes, num(r.taxa)]))

  const saida: MesDre[] = []
  for (let i = 0; i < meses; i++) {
    const d = new Date(Date.UTC(ano, mes - meses + i, 1))
    const chave = chaveDe(d)
    const bruto = num(v.get(chave)?.bruto)
    const resumo = linhasDespesa.get(chave)
    const { porGrupo } = resumo
      ? agruparDespesas(resumo.porCategoria, mapa)
      : { porGrupo: {} as Partial<Record<GrupoDre, number>> }

    saida.push({
      ano: d.getUTCFullYear(),
      mes: d.getUTCMonth() + 1,
      entrada: {
        receitaMotos: bruto,
        receitaServicos: num(os.get(chave)?.servicos),
        receitaPecas: num(pc.get(chave)?.total) + num(os.get(chave)?.pecas),
        taxasCartao: bruto - num(v.get(chave)?.liquido) + (tx.get(chave) ?? 0),
        cmvMotos: num(v.get(chave)?.custo),
        despesasPorGrupo: porGrupo,
        memorando: resumo ? memorandoDe(resumo) : {},
      },
    })
  }
  return saida
}

// ─── Despesas ────────────────────────────────────────────────────────────────

/** As três fontes de despesa do período, já passadas pelo somarDespesas. */
async function resumoDespesasDoPeriodo(grupoId: string, lojaIds: string[], inicio: Date, fim: Date) {
  const config = await configDespesas(grupoId)
  const [banco, manuais, caixa] = await Promise.all([
    db.select({
        valor: despesasOpenFinance.valor,
        categoria: despesasOpenFinance.categoria,
        favorecidoNome: despesasOpenFinance.favorecidoNome,
        descricao: despesasOpenFinance.descricao,
        lojaId: despesasOpenFinance.lojaId,
      })
      .from(despesasOpenFinance)
      .where(and(
        eq(despesasOpenFinance.grupoId, grupoId),
        gte(despesasOpenFinance.data, inicio),
        lt(despesasOpenFinance.data, fim),
      )),

    // Sem o NOT EXISTS, toda despesa lançada pelo botão do Importar do Banco
    // entraria duas vezes.
    db.select({ valor: despesas.valor, categoria: despesas.categoria, lojaId: despesas.lojaId })
      .from(despesas)
      .where(and(
        eq(despesas.grupoId, grupoId),
        gte(despesas.data, inicio.toISOString().slice(0, 10)),
        lt(despesas.data, fim.toISOString().slice(0, 10)),
        sql`NOT EXISTS (SELECT 1 FROM ${despesasOpenFinance} o WHERE o.despesa_id = ${despesas.id})`,
      )),

    db.select({ valor: lancamentosCaixa.valor, categoria: lancamentosCaixa.categoria, lojaId: lancamentosCaixa.lojaId })
      .from(lancamentosCaixa)
      .where(and(
        eq(lancamentosCaixa.tipo, 'saida'),
        ne(lancamentosCaixa.statusAprovacao, 'reprovado'),
        // lancamentos_caixa nao tem grupo_id: o recorte por bandeira vem das
        // lojas, como o /financeiro tambem faz. Sem isto, a gaveta de BH entraria
        // na despesa do Sul de Minas.
        inArray(lancamentosCaixa.lojaId, lojaIds),
        gte(lancamentosCaixa.data, inicio.toISOString().slice(0, 10)),
        lt(lancamentosCaixa.data, fim.toISOString().slice(0, 10)),
      )),
  ])

  return somarDespesas(banco, manuais, config, caixa)
}

/**
 * O mesmo, mas para N meses de uma vez: busca o período inteiro e chama o
 * somarDespesas mês a mês em memória. Repetir as consultas por mês é o que
 * derrubaria o pooler.
 */
async function despesasPorMes(grupoId: string, lojaIds: string[], inicio: Date, fim: Date) {
  const config = await configDespesas(grupoId)
  const chave = (d: Date | string) => {
    const dt = typeof d === 'string' ? new Date(`${d}T12:00:00Z`) : d
    return `${dt.getUTCFullYear()}-${dt.getUTCMonth() + 1}`
  }

  const [banco, manuais, caixa] = await Promise.all([
    db.select({
        data: despesasOpenFinance.data,
        valor: despesasOpenFinance.valor,
        categoria: despesasOpenFinance.categoria,
        favorecidoNome: despesasOpenFinance.favorecidoNome,
        descricao: despesasOpenFinance.descricao,
        lojaId: despesasOpenFinance.lojaId,
      })
      .from(despesasOpenFinance)
      .where(and(
        eq(despesasOpenFinance.grupoId, grupoId),
        gte(despesasOpenFinance.data, inicio),
        lt(despesasOpenFinance.data, fim),
      )),

    db.select({ data: despesas.data, valor: despesas.valor, categoria: despesas.categoria, lojaId: despesas.lojaId })
      .from(despesas)
      .where(and(
        eq(despesas.grupoId, grupoId),
        gte(despesas.data, inicio.toISOString().slice(0, 10)),
        lt(despesas.data, fim.toISOString().slice(0, 10)),
        sql`NOT EXISTS (SELECT 1 FROM ${despesasOpenFinance} o WHERE o.despesa_id = ${despesas.id})`,
      )),

    db.select({ data: lancamentosCaixa.data, valor: lancamentosCaixa.valor, categoria: lancamentosCaixa.categoria, lojaId: lancamentosCaixa.lojaId })
      .from(lancamentosCaixa)
      .where(and(
        eq(lancamentosCaixa.tipo, 'saida'),
        ne(lancamentosCaixa.statusAprovacao, 'reprovado'),
        // lancamentos_caixa nao tem grupo_id: o recorte por bandeira vem das
        // lojas, como o /financeiro tambem faz. Sem isto, a gaveta de BH entraria
        // na despesa do Sul de Minas.
        inArray(lancamentosCaixa.lojaId, lojaIds),
        gte(lancamentosCaixa.data, inicio.toISOString().slice(0, 10)),
        lt(lancamentosCaixa.data, fim.toISOString().slice(0, 10)),
      )),
  ])

  const meses = new Set<string>([
    ...banco.map(b => chave(b.data)),
    ...manuais.map(m => chave(m.data)),
    ...caixa.map(c => chave(c.data)),
  ])

  const saida = new Map<string, TotalDespesas>()
  for (const m of meses) {
    saida.set(m, somarDespesas(
      banco.filter(b => chave(b.data) === m),
      manuais.filter(x => chave(x.data) === m),
      config,
      caixa.filter(c => chave(c.data) === m),
    ))
  }
  return saida
}

// ─── Colunas prontas para a tabela ───────────────────────────────────────────
// A tela de navegar e a de imprimir chamam estes dois: um demonstrativo que
// muda de número conforme a página que o mostra não serve pra conferir nada.

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** Colunas da visão por loja: cada loja, o Geral (Empresa) e o TOTAL. */
export async function colunasDoMes(opts: {
  grupoId: string; lojaIds: string[]; ano: number; mes: number
}) {
  const { colunas, semGrupo } = await dreDoMes(opts)
  if (colunas.length === 0) return { colunas: [], semGrupo }

  const total = colunas.reduce((a, c) => somarEntradas(a, c.entrada), ENTRADA_VAZIA)
  // O memorando não guarda loja (o motivo é da categoria), então só existe no
  // total — nas colunas de loja ele apareceria zerado e sugeriria que a loja não
  // teve retirada, o que é diferente de "não dá pra saber".
  total.memorando = await memorandoDoMes(opts.grupoId, opts.lojaIds, opts.ano, opts.mes)

  return { colunas: [...colunas, { chave: '__total', rotulo: 'TOTAL', entrada: total }], semGrupo }
}

/** Colunas da visão de evolução: um mês por coluna, consolidado do grupo. */
export async function colunasEvolucao(opts: {
  grupoId: string; lojaIds: string[]; ano: number; mes: number; meses: number
}) {
  const linhas = await dreEvolucao(opts)
  return linhas.map(m => ({
    chave: `${m.ano}-${m.mes}`,
    rotulo: `${MES_CURTO[m.mes - 1]}/${String(m.ano).slice(2)}`,
    entrada: m.entrada,
  }))
}
