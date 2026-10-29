import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { mesBrt } from '@/lib/data-venda'
import { getGrupoAtivo, listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db, execRows } from '@/lib/db'
import { vendas, lojas, usuarios, motos, modelos, conciliacoesCartao, despesas, despesasOpenFinance, ordensServico, vendasPecas, lancamentosCaixa } from '@/lib/db/schema'
import { eq, ne, and, gte, lte, sql, count, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FinanceiroFiltros } from './components/financeiro-filtros'
import { ResumoLojas } from './components/resumo-lojas'
import { ResumoVendedores } from './components/resumo-vendedores'
import { ResumoPagamentos } from './components/resumo-pagamentos'
import { ResumoParcelamento } from './components/resumo-parcelamento'
import { ResumoProdutos } from './components/resumo-produtos'
import { ResumoDespesas } from './components/resumo-despesas'
import { ResumoDespesasPorLoja } from './components/resumo-despesas-loja'
import { ResumoDespesasGeral } from './components/resumo-despesas-geral'
import { ResumoDespesasLojaCategoria } from './components/resumo-despesas-loja-categoria'
import { ResumoRetiradas } from './components/resumo-retiradas'
import { somarDespesas, valorDespesa, type MotivoForaDoCalculo } from '@/lib/despesas-operacionais'
import { configDespesas } from '@/lib/queries/config-despesas'
import { calcularResultadoPorLoja } from '@/lib/resultado-por-loja'
import { despesaDaLojaFiltrada } from '@/lib/despesa-loja-filtrada'
import { valorLiquidoExpr } from '@/lib/queries/valor-liquido'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { somaCustoMotoExpr, qtdSemCustoExpr } from '@/lib/queries/custo-moto'
import { TriangleAlert } from 'lucide-react'

/** Valor do filtro de loja que significa "só o balde da empresa". */
const ESCOPO_GERAL = 'geral'

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/financeiro')) redirect('/dashboard')

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const grupo = await getGrupoAtivo(usuario)

  const params = await searchParams
  const mesParam = params.mes ?? mesBrt()
  const lojaParam = params.loja ?? ''
  // "Geral" é o balde da empresa: as despesas que o Importar do Banco deixou sem
  // loja atribuída — contabilidade, pró-labore, sistema. Não é uma loja, então não
  // tem faturamento, OS, peça nem caixa: o recorte zera todas as receitas de
  // propósito e sobra o custo da estrutura. Sem isso não havia como olhar essas
  // despesas isoladas — elas só apareciam somadas à loja que você escolhesse.
  const escopoGeral = lojaParam === ESCOPO_GERAL
  const lojaParamValido = !escopoGeral && lojaParam && lojaIdsGrupo.includes(lojaParam) ? lojaParam : ''
  /** Nada casa: o Geral não tem receita nenhuma atribuída. */
  const nenhumaLinha = sql`false`

  const [ano, mes] = mesParam.split('-').map(Number)
  const inicioMes = `${mesParam}-01`
  const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0]
  const inicioTs = new Date(`${inicioMes}T00:00:00Z`)
  const fimTs = new Date(`${ano}-${String(mes + 1).padStart(2, '0')}-01T00:00:00Z`)

  const lojaFiltroVendas = escopoGeral ? nenhumaLinha
    : lojaParamValido ? eq(vendas.lojaId, lojaParamValido) : inArray(vendas.lojaId, lojaIdsGrupo)
  const lojaCondPagamento = escopoGeral
    ? sql`AND false`
    : lojaParamValido
    ? sql`AND v.loja_id = ${lojaParamValido}`
    : sql`AND v.loja_id IN (${sql.join(lojaIdsGrupo.map(id => sql`${id}`), sql`, `)})`

  const lojaFiltroOS = escopoGeral ? nenhumaLinha
    : lojaParamValido ? eq(ordensServico.lojaId, lojaParamValido) : inArray(ordensServico.lojaId, lojaIdsGrupo)
  const lojaFiltroPecas = escopoGeral ? nenhumaLinha
    : lojaParamValido ? eq(vendasPecas.lojaId, lojaParamValido) : inArray(vendasPecas.lojaId, lojaIdsGrupo)

  // Versões em SQL cru dos mesmos filtros, pra usar dentro dos subselects da taxa.
  const lojaCondOSTaxa = escopoGeral
    ? sql`AND false`
    : lojaParamValido
    ? sql`AND o.loja_id = ${lojaParamValido}`
    : sql`AND o.loja_id IN (${sql.join(lojaIdsGrupo.map(id => sql`${id}`), sql`, `)})`
  const lojaCondPecaTaxa = escopoGeral
    ? sql`AND false`
    : lojaParamValido
    ? sql`AND p.loja_id = ${lojaParamValido}`
    : sql`AND p.loja_id IN (${sql.join(lojaIdsGrupo.map(id => sql`${id}`), sql`, `)})`

  const [totaisVendas, resumoPorLoja, lojasOpts, resumoPorVendedor, resumoPorPagamentoRaw, parcelamentoRaw, resumoPorModelo, saidasBanco, manuaisForaDoBanco, config, totaisOS, totaisPecas, taxasOutras, saidasCaixa] = await Promise.all([
    db
      .select({
        totalVendas: sql<string>`COALESCE(SUM(${vendas.valor}), '0')`,
        totalLiquido: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), '0')`,
        totalCusto: sql<string>`${somaCustoMotoExpr()}`,
        qtdSemCusto: sql<string>`${qtdSemCustoExpr()}`,
        qtdVendas: count(),
      })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .where(and(
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
        lojaFiltroVendas,
      )),

    // Receita, custo e quantidade por loja. O leftJoin mantém na tabela a loja que não
    // vendeu no mês — ela ainda carrega despesa, então some do resultado se cair fora.
    db
      .select({
        lojaId: lojas.id,
        lojaNome: lojas.nome,
        totalVendas:   sql<string>`COALESCE(SUM(${vendas.valor}), '0')`,
        totalLiquido:  sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), '0')`,
        totalCusto:    sql<string>`${somaCustoMotoExpr()}`,
        qtdSemCusto:   sql<string>`${qtdSemCustoExpr()}`,
        qtdVendas:     sql<string>`COUNT(${vendas.id})`,
      })
      .from(lojas)
      .leftJoin(vendas, and(
        eq(vendas.lojaId, lojas.id),
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
      ))
      .leftJoin(motos, eq(vendas.motoId, motos.id))
      .where(inArray(lojas.id, lojaIdsGrupo))
      .groupBy(lojas.id, lojas.nome)
      .orderBy(lojas.nome),

    listarLojasDoGrupoAtivo(usuario),

    db
      .select({
        vendedorNome: usuarios.nome,
        qtdVendas: count(),
        totalBruto: sql<string>`COALESCE(SUM(${vendas.valor}::numeric), 0)`,
        totalLiquido: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), 0)`,
      })
      .from(vendas)
      .innerJoin(usuarios, eq(vendas.vendedorId, usuarios.id))
      .where(and(
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
        lojaFiltroVendas,
      ))
      .groupBy(vendas.vendedorId, usuarios.nome)
      .orderBy(sql`SUM(${vendas.valor}::numeric) DESC`),

    execRows(sql`
      SELECT
        p.tipo,
        COALESCE(SUM(p.valor::numeric), 0)::text AS total,
        COUNT(DISTINCT v.id)::int AS qtd_vendas
      FROM ${vendas} v,
      LATERAL jsonb_to_recordset(COALESCE(v.pagamentos, '[]'::jsonb)) AS p(tipo text, valor numeric)
      WHERE v.data_venda >= ${inicioTs.toISOString()}
        AND v.data_venda < ${fimTs.toISOString()}
        ${lojaCondPagamento}
      GROUP BY p.tipo
      ORDER BY SUM(p.valor::numeric) DESC
    `),

    // Quantas vendas em cada prazo de cartão. Mesma fonte da consulta acima, com o
    // recorte por `parcelas` — financiamento fica de fora de propósito: ele também
    // tem "parcelas", mas são meses de banco, não prazo de cartão.
    execRows(sql`
      SELECT
        p.tipo,
        p.parcelas,
        COALESCE(SUM(p.valor::numeric), 0)::text AS total,
        COUNT(DISTINCT v.id)::int AS qtd_vendas
      FROM ${vendas} v,
      LATERAL jsonb_to_recordset(COALESCE(v.pagamentos, '[]'::jsonb)) AS p(tipo text, valor numeric, parcelas int)
      WHERE v.data_venda >= ${inicioTs.toISOString()}
        AND v.data_venda < ${fimTs.toISOString()}
        AND p.tipo IN ('cartao_credito', 'link_pagamento')
        ${lojaCondPagamento}
      GROUP BY p.tipo, p.parcelas
      ORDER BY p.tipo, p.parcelas
    `),

    // Lucro por modelo: mesma receita líquida usada no resto da tela menos o custo
    // da moto. Sem rateio de despesa da operação — o card diz isso na cara, porque
    // "lucro por produto" com despesa rateada seria outra conta, e por critério
    // discutível (rateia por faturamento? por unidade?).
    db
      .select({
        marca: modelos.marca,
        modelo: nomeDoModeloNaLoja(vendas.lojaId),
        qtd: count(),
        totalLiquido: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), 0)`,
        totalCusto: sql<string>`${somaCustoMotoExpr()}`,
        semCusto: sql<string>`${qtdSemCustoExpr()}`,
      })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(and(
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
        lojaFiltroVendas,
      ))
      .groupBy(modelos.marca, nomeDoModeloNaLoja(vendas.lojaId)),

    // Saídas do Importar do Banco no período (loja filtrada + as sem loja atribuída,
    // que são as despesas gerais da empresa). Essa é a base do card de despesas desde
    // que o Open Finance entrou — os lançamentos manuais viraram complemento.
    db
      .select({
        valor:          despesasOpenFinance.valor,
        categoria:      despesasOpenFinance.categoria,
        favorecidoNome: despesasOpenFinance.favorecidoNome,
        descricao:      despesasOpenFinance.descricao,
        lojaId:         despesasOpenFinance.lojaId,
      })
      .from(despesasOpenFinance)
      .where(and(
        eq(despesasOpenFinance.grupoId, grupo.id),
        gte(despesasOpenFinance.data, inicioTs),
        lte(despesasOpenFinance.data, fimTs),
        escopoGeral
          ? sql`${despesasOpenFinance.lojaId} IS NULL`
          : lojaParamValido
          ? sql`(${despesasOpenFinance.lojaId} = ${lojaParamValido} OR ${despesasOpenFinance.lojaId} IS NULL)`
          : undefined,
      )),

    // Lançamentos manuais que NÃO nasceram de uma saída do banco — as contas pagas
    // fora da conta do Open Finance. Sem esse NOT EXISTS toda despesa lançada pelo
    // botão "lançar" do Importar do Banco entraria duas vezes.
    db
      .select({
        valor:     despesas.valor,
        categoria: despesas.categoria,
        lojaId:    despesas.lojaId,
      })
      .from(despesas)
      .where(and(
        eq(despesas.grupoId, grupo.id),
        gte(despesas.data, inicioMes),
        lte(despesas.data, ultimoDia),
        sql`NOT EXISTS (SELECT 1 FROM ${despesasOpenFinance} o WHERE o.despesa_id = ${despesas.id})`,
        escopoGeral
          ? sql`${despesas.lojaId} IS NULL`
          : lojaParamValido
          ? sql`(${despesas.lojaId} = ${lojaParamValido} OR ${despesas.lojaId} IS NULL)`
          : undefined,
      )),

    // Regras de exclusão (categorias marcadas, fábrica, empresa do grupo). Sai
    // da mesma função que o DRE usa — o resultado operacional de lá tem que
    // bater com o Lucro Líquido daqui.
    configDespesas(grupo.id),

    // OS concluídas no período — valor de serviço (mão de obra) x peças usadas, separado
    // porque comissiona papéis diferentes (mecânico x aux. adm.) na Folha de Pagamento.
    db
      .select({
        totalServicos: sql<string>`COALESCE(SUM(${ordensServico.valorServicos}::numeric), 0)`,
        totalPecas:    sql<string>`COALESCE(SUM(${ordensServico.valorPecas}::numeric), 0)`,
        qtdOS:         count(),
      })
      .from(ordensServico)
      .where(and(
        eq(ordensServico.status, 'concluida'),
        gte(ordensServico.dataConclusao, inicioTs),
        lte(ordensServico.dataConclusao, fimTs),
        lojaFiltroOS,
      )),

    // Venda de peça no balcão, fora de OS.
    db
      .select({
        total:  sql<string>`COALESCE(SUM(${vendasPecas.valorTotal}::numeric), 0)`,
        qtd:    count(),
      })
      .from(vendasPecas)
      .where(and(
        gte(vendasPecas.dataVenda, inicioTs),
        lte(vendasPecas.dataVenda, fimTs),
        lojaFiltroPecas,
      )),

    // Taxa de cartão de OS e de peça. A de moto já sai de bruto − líquido na query de
    // vendas; estas duas não tinham de onde sair porque o faturamento antes era só moto.
    // Ancorado na data da venda/conclusão, não na data da transação no extrato, pra taxa
    // e receita caírem sempre no mesmo mês.
    execRows(sql`
      SELECT COALESCE(SUM(c.valor_bruto::numeric - COALESCE(c.valor_liquido::numeric, c.valor_bruto::numeric)), 0)::text AS taxa
      FROM ${conciliacoesCartao} c
      WHERE c.conciliado = true
        AND (
          c.os_id IN (
            SELECT o.id FROM ${ordensServico} o
            WHERE o.status = 'concluida'
              AND o.data_conclusao >= ${inicioTs.toISOString()} AND o.data_conclusao <= ${fimTs.toISOString()}
              ${lojaCondOSTaxa}
          )
          OR c.peca_venda_id IN (
            SELECT p.id FROM ${vendasPecas} p
            WHERE p.data_venda >= ${inicioTs.toISOString()} AND p.data_venda <= ${fimTs.toISOString()}
              ${lojaCondPecaTaxa}
          )
        )
    `),

    // Dinheiro pago da gaveta pelo administrativo da loja. Nunca aparece no extrato,
    // então sem isto a despesa em espécie sumia do resultado. Reprovado fica de fora,
    // igual faz o /caixa.
    db
      .select({
        valor:     lancamentosCaixa.valor,
        categoria: lancamentosCaixa.categoria,
        lojaId:    lancamentosCaixa.lojaId,
      })
      .from(lancamentosCaixa)
      .where(and(
        eq(lancamentosCaixa.tipo, 'saida'),
        gte(lancamentosCaixa.data, inicioMes),
        lte(lancamentosCaixa.data, ultimoDia),
        ne(lancamentosCaixa.statusAprovacao, 'reprovado'),
        // Caixa é sempre de uma loja — no recorte Geral não entra nenhum.
        escopoGeral
          ? nenhumaLinha
          : lojaParamValido
          ? eq(lancamentosCaixa.lojaId, lojaParamValido)
          : inArray(lancamentosCaixa.lojaId, lojaIdsGrupo),
      )),
  ])

  const receitaVendas = Number(totaisVendas[0]?.totalVendas ?? 0)
  const receitaLiquida = Number(totaisVendas[0]?.totalLiquido ?? 0)
  const qtdVendas = Number(totaisVendas[0]?.qtdVendas ?? 0)

  const resumoDespesas = somarDespesas(saidasBanco, manuaisForaDoBanco, config, saidasCaixa)
  // Resultado por loja, com a despesa sem dono rateada na proporção do que cada
  // uma faturou. Calculado ANTES dos cards de propósito: quando há uma loja no
  // filtro, o card de despesa lê a linha dela aqui, pra card e tabela saírem da
  // mesma fonte. As vendas por loja nunca são filtradas (a query traz as seis),
  // então a proporção do rateio não se distorce com o filtro ligado.
  const resultadoLojas = calcularResultadoPorLoja(
    resumoPorLoja.map(r => ({
      lojaId:         r.lojaId,
      lojaNome:       r.lojaNome,
      qtdVendas:      Number(r.qtdVendas),
      receitaBruta:   Number(r.totalVendas),
      receitaLiquida: Number(r.totalLiquido),
      custoMotos:     Number(r.totalCusto),
      qtdSemCusto:    Number(r.qtdSemCusto),
    })),
    resumoDespesas.porLoja,
  )

  // Com uma loja no filtro, a query de despesa traz a loja MAIS o balde da
  // estrutura (loja_id IS NULL). Somar os dois fazia a loja carregar sozinha a
  // estrutura do grupo inteiro — ver despesa-loja-filtrada.ts.
  const visaoLoja = lojaParamValido
    ? despesaDaLojaFiltrada(resumoDespesas, resultadoLojas, lojaParamValido)
    : null

  const totalDespesas = visaoLoja ? visaoLoja.total : resumoDespesas.total
  const totalCusto = Number(totaisVendas[0]?.totalCusto ?? 0)
  const qtdSemCusto = Number(totaisVendas[0]?.qtdSemCusto ?? 0)

  // ─── Faturamento das três frentes ───────────────────────────────────────────
  // Antes o Financeiro só enxergava moto: OS e peça ficavam em cards soltos, fora
  // do faturamento e fora do lucro.
  const totalServicosOS = Number(totaisOS[0]?.totalServicos ?? 0)
  const totalPecasOS    = Number(totaisOS[0]?.totalPecas ?? 0)
  const qtdOS           = Number(totaisOS[0]?.qtdOS ?? 0)
  const totalPecasAvulsas = Number(totaisPecas[0]?.total ?? 0)
  const qtdPecasAvulsas   = Number(totaisPecas[0]?.qtd ?? 0)

  // Peça usada em OS entra aqui, não no valor da OS — assim "Ordem de Serviço" é só
  // mão de obra e nada é contado duas vezes.
  const faturamentoPecas = totalPecasAvulsas + totalPecasOS
  const faturamentoBruto = receitaVendas + totalServicosOS + faturamentoPecas

  const taxaCartaoMotos = receitaVendas - receitaLiquida
  const taxaCartaoOutras = Number((taxasOutras as unknown as { taxa: string }[])[0]?.taxa ?? 0)
  const taxasCartao = taxaCartaoMotos + taxaCartaoOutras

  const faturamentoLiquido = faturamentoBruto - taxasCartao

  // Compra de mercadoria. Fica FORA do lucro de propósito: o custo da moto vendida já
  // está em "Custo Total", e comprar estoque não é despesa do mês — é dinheiro que
  // virou moto na prateleira. O card existe só pra enxergar o desembolso.
  const CATEGORIAS_COMPRA = new Set(['Compra de Motos', 'Compra Capacetes', 'Compra de PEÇAS'])
  const totalCompras =
    saidasBanco
      .filter(s => s.categoria && CATEGORIAS_COMPRA.has(s.categoria))
      .reduce((t, s) => t + valorDespesa(s.valor), 0)
    + manuaisForaDoBanco
      .filter(m => CATEGORIAS_COMPRA.has(m.categoria))
      .reduce((t, m) => t + valorDespesa(m.valor), 0)

  const receitaBruta = faturamentoLiquido - totalCusto

  // Quanto do que entrou é consumido pela operação. Não é margem de lucro — é o
  // peso da despesa sobre o faturamento; quanto MENOR, melhor.
  const percentualDespesa = faturamentoLiquido > 0 ? (totalDespesas / faturamentoLiquido) * 100 : 0
  // Sem imposto estimado por alíquota: o imposto que a empresa paga já sai do extrato
  // como despesa (categoria "Impostos"). Descontar os dois contava o mesmo tributo
  // duas vezes — R$ 230 mil num mês de R$ 1,55 milhão no Sul de Minas.
  const lucroLiquido = receitaBruta - totalDespesas

  // Margem líquida: quanto de cada real faturado sobrou como lucro.
  const percentualLucro = faturamentoLiquido > 0 ? (lucroLiquido / faturamentoLiquido) * 100 : 0

  // Em que cada loja gasta. Ordenado pelo total: o card abre na que mais gastou,
  // que é a que alguém vai querer olhar primeiro.
  const despesasPorLojaCategoria = lojasOpts
    .map(l => ({
      lojaId: l.id,
      nome: l.nome,
      total: resumoDespesas.porLoja.get(l.id) ?? 0,
      categorias: resumoDespesas.porCategoriaPorLoja.get(l.id) ?? [],
    }))
    .filter(l => l.total > 0)
    .sort((a, b) => b.total - a.total)

  const resumoPorPagamento = (resumoPorPagamentoRaw as any[]).map(r => ({
    tipo: r.tipo as string,
    total: r.total as string,
    qtdVendas: Number(r.qtd_vendas),
  }))

  const produtos = resumoPorModelo.map(r => ({
    marca: r.marca,
    modelo: r.modelo,
    qtd: Number(r.qtd),
    totalLiquido: r.totalLiquido,
    totalCusto: r.totalCusto,
    semCusto: Number(r.semCusto),
  }))

  const parcelamento = (parcelamentoRaw as any[]).map(r => ({
    tipo: r.tipo as string,
    // Venda antiga não gravava parcelas: vira "não informado" na tabela, em vez de
    // ser somada no 1x e inventar uma escolha que o cliente não fez.
    parcelas: r.parcelas === null ? null : Number(r.parcelas),
    total: r.total as string,
    qtdVendas: Number(r.qtd_vendas),
  }))

  function fmt(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Financeiro</h1>

      <FinanceiroFiltros lojas={lojasOpts} mesAtual={mesParam} lojaAtual={lojaParam} />

      {escopoGeral && (
        <p className="text-sm text-muted-foreground bg-muted border rounded-lg px-4 py-2">
          Recorte <strong>Geral (Empresa)</strong>: só as despesas que ficaram sem loja atribuída no
          Importar do Banco. Não há faturamento aqui — venda, OS e peça pertencem sempre a uma
          loja —, então o lucro abaixo é o custo da estrutura, negativo por natureza.
        </p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <Card className="md:col-span-2 xl:col-span-1 xl:row-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Vendas no Período</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Motos</p>
                <p className="text-xs text-muted-foreground">{qtdVendas} venda{qtdVendas === 1 ? '' : 's'}</p>
              </div>
              <p className="text-lg font-bold">{fmt(receitaVendas)}</p>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Ordem de Serviço</p>
                <p className="text-xs text-muted-foreground">{qtdOS} OS · só mão de obra</p>
              </div>
              <p className="text-lg font-bold text-info">{fmt(totalServicosOS)}</p>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-sm font-medium">Peças</p>
                <p className="text-xs text-muted-foreground">
                  {qtdPecasAvulsas} avulsa{qtdPecasAvulsas === 1 ? '' : 's'} + usadas em OS
                </p>
              </div>
              <p className="text-lg font-bold text-info">{fmt(faturamentoPecas)}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Faturamento Bruto</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(faturamentoBruto)}</p>
            <p className="text-xs text-muted-foreground">motos + OS + peças</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Faturamento Líquido</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-success">{fmt(faturamentoLiquido)}</p>
            <p className="text-xs text-muted-foreground">bruto − taxas de cartão</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Taxas Cartão</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">-{fmt(taxasCartao)}</p>
            {faturamentoBruto > 0 && (
              <p className="text-xs text-muted-foreground">{((taxasCartao / faturamentoBruto) * 100).toFixed(1)}% do bruto</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Despesas Operac.</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{totalDespesas > 0 ? '-' : ''}{fmt(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Despesa s/ Faturamento</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-warning">
              {percentualDespesa.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </p>
            <p className="text-xs text-muted-foreground">despesa operac. ÷ faturamento líquido</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Custo Total (Motos Vendidas)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-destructive">{totalCusto > 0 ? '-' : ''}{fmt(totalCusto)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Compras (Motos, Capacetes, Peças)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-muted-foreground">{fmt(totalCompras)}</p>
            <p className="text-xs text-muted-foreground">fora do lucro — é estoque, não despesa</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Receita Bruta</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${receitaBruta >= 0 ? 'text-success' : 'text-destructive'}`}>
              {fmt(receitaBruta)}
            </p>
            <p className="text-xs text-muted-foreground">líquido − custo das motos</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Lucro Líquido</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${lucroLiquido >= 0 ? 'text-success' : 'text-destructive'}`}>
              {fmt(lucroLiquido)}
            </p>
            <p className="text-xs text-muted-foreground">receita bruta − despesas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">% de Lucro</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${percentualLucro >= 0 ? 'text-success' : 'text-destructive'}`}>
              {percentualLucro.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
            </p>
            <p className="text-xs text-muted-foreground">lucro líquido ÷ faturamento líquido</p>
          </CardContent>
        </Card>
      </div>

      {qtdSemCusto > 0 && (
        <p className="text-xs text-warning">
          <TriangleAlert size={12} className="inline -mt-0.5 mr-1" aria-hidden />{qtdSemCusto} venda{qtdSemCusto > 1 ? 's' : ''} sem custo de moto registrado (conta{qtdSemCusto > 1 ? 'm' : ''} como R$ 0,00 no cálculo).
        </p>
      )}

      {/* No recorte Geral estes quadros seriam só células vazias: resultado, forma de
          pagamento, vendedor e despesa por loja só existem quando há loja. */}
      {!escopoGeral && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <ResumoLojas resultado={resultadoLojas} />
            <ResumoPagamentos resumo={resumoPorPagamento} />
          </div>

          {/* Logo depois de Formas de Pagamento: é o detalhe da linha "Cartão
              Crédito" de lá, e ler os dois juntos é o que responde a pergunta. */}
          <ResumoParcelamento linhas={parcelamento} />

          {/* Depois do parcelamento e antes dos vendedores: os três respondem
              "onde está o dinheiro" — por prazo, por produto e por pessoa. */}
          <ResumoProdutos linhas={produtos} />

          <ResumoVendedores resumo={resumoPorVendedor} />
        </>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResumoDespesas resumo={visaoLoja ? { ...resumoDespesas, total: visaoLoja.total, porCategoria: visaoLoja.porCategoria } : resumoDespesas} />
        {!escopoGeral && <ResumoDespesasPorLoja porLoja={resumoDespesas.porLoja} lojas={lojasOpts} />}
        <ResumoDespesasGeral porCategoriaGeral={resumoDespesas.porCategoriaGeral} />
        {!escopoGeral && <ResumoDespesasLojaCategoria lojas={despesasPorLojaCategoria} />}
        <ResumoRetiradas
          foraPorCategoria={resumoDespesas.foraPorCategoria}
          lucroLiquido={lucroLiquido}
        />
      </div>

    </div>
  )
}
