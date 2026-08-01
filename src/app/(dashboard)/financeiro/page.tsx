import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { vendas, lancamentosCaixa, lojas, usuarios, motos, modelos, conciliacoesCartao, despesas, despesasOpenFinance, categoriasDespesa, favorecidosNaoOperacionais, ordensServico } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, lt, ne, sql, count, inArray } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FinanceiroFiltros } from './components/financeiro-filtros'
import { VendasTable } from './components/vendas-table'
import { ResumoLojas } from './components/resumo-lojas'
import { ResumoVendedores } from './components/resumo-vendedores'
import { ResumoPagamentos } from './components/resumo-pagamentos'
import { ResumoDespesas } from './components/resumo-despesas'
import { somarDespesas, type MotivoForaDoCalculo } from '@/lib/despesas-operacionais'
import { calcularResultadoPorLoja } from '@/lib/resultado-por-loja'

// Parte não paga em cartão fica como está; a parte paga em cartão e já conciliada é trocada
// pelo valor líquido. Cobre vendas com forma "multiplos" (cartão + pix/dinheiro), onde a parte
// não-cartão não pode ser descartada do total.
function valorLiquidoExpr() {
  return sql<string>`(
    ${vendas.valor}::numeric
    - COALESCE((SELECT SUM(${conciliacoesCartao.valorBruto}::numeric)
                FROM ${conciliacoesCartao}
                WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
                  AND ${conciliacoesCartao.conciliado} = true), 0)
    + COALESCE((SELECT SUM(${conciliacoesCartao.valorLiquido}::numeric)
                FROM ${conciliacoesCartao}
                WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
                  AND ${conciliacoesCartao.conciliado} = true), 0)
  )`
}

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) redirect('/dashboard')

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const grupo = await getGrupoAtivo(usuario)

  const params = await searchParams
  const mesParam = params.mes ?? new Date().toISOString().slice(0, 7)
  const lojaParam = params.loja ?? ''
  const lojaParamValido = lojaParam && lojaIdsGrupo.includes(lojaParam) ? lojaParam : ''

  const [ano, mes] = mesParam.split('-').map(Number)
  const inicioMes = `${mesParam}-01`
  const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0]
  const inicioTs = new Date(`${inicioMes}T00:00:00Z`)
  const fimTs = new Date(`${ano}-${String(mes + 1).padStart(2, '0')}-01T00:00:00Z`)

  const lojaFiltroVendas = lojaParamValido ? eq(vendas.lojaId, lojaParamValido) : inArray(vendas.lojaId, lojaIdsGrupo)
  const lojaFiltroCaixa = lojaParamValido ? eq(lancamentosCaixa.lojaId, lojaParamValido) : inArray(lancamentosCaixa.lojaId, lojaIdsGrupo)
  const lojaCondPagamento = lojaParamValido
    ? sql`AND v.loja_id = ${lojaParamValido}`
    : sql`AND v.loja_id IN (${sql.join(lojaIdsGrupo.map(id => sql`${id}`), sql`, `)})`

  const lojaFiltroOS = lojaParamValido ? eq(ordensServico.lojaId, lojaParamValido) : inArray(ordensServico.lojaId, lojaIdsGrupo)

  const [vendasMes, totaisVendas, totaisCaixa, saldoAnteriorRaw, resumoPorLoja, lojasOpts, resumoPorVendedor, resumoPorPagamentoRaw, saidasBanco, manuaisForaDoBanco, categoriasForaRows, cnpjsForaRows, totaisOS] = await Promise.all([
    db
      .select({
        id: vendas.id,
        clienteNome: vendas.clienteNome,
        clienteCpf: vendas.clienteCpf,
        valor: vendas.valor,
        formaPagamento: vendas.formaPagamento,
        dataVenda: vendas.dataVenda,
        lojaNome: lojas.nome,
        vendedorNome: usuarios.nome,
        modelo: modelos.modelo,
        marca: modelos.marca,
        cor: motos.cor,
        chassi: motos.chassi,
        precoCompra: motos.precoCompra,
        valorLiquido: valorLiquidoExpr(),
      })
      .from(vendas)
      .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
      .innerJoin(usuarios, eq(vendas.vendedorId, usuarios.id))
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(and(
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
        lojaFiltroVendas,
      ))
      .orderBy(desc(vendas.dataVenda)),

    db
      .select({
        totalVendas: sql<string>`COALESCE(SUM(${vendas.valor}), '0')`,
        totalLiquido: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), '0')`,
        totalCusto: sql<string>`COALESCE(SUM(${motos.precoCompra}), '0')`,
        qtdSemCusto: sql<string>`COUNT(*) FILTER (WHERE ${motos.precoCompra} IS NULL)`,
        qtdVendas: count(),
      })
      .from(vendas)
      .innerJoin(motos, eq(vendas.motoId, motos.id))
      .where(and(
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
        lojaFiltroVendas,
      )),

    // Movimento do mês. Reprovado fica de fora, igual faz o /caixa — senão as duas
    // telas mostram números diferentes pro mesmo caixa.
    db
      .select({
        tipo: lancamentosCaixa.tipo,
        total: sql<string>`COALESCE(SUM(${lancamentosCaixa.valor}), '0')`,
      })
      .from(lancamentosCaixa)
      .where(and(
        gte(lancamentosCaixa.data, inicioMes),
        lte(lancamentosCaixa.data, ultimoDia),
        ne(lancamentosCaixa.statusAprovacao, 'reprovado'),
        lojaFiltroCaixa,
      ))
      .groupBy(lancamentosCaixa.tipo),

    // Saldo acumulado até o começo do mês. Sem ele, "entradas − saídas do mês" é a
    // VARIAÇÃO do período, não o dinheiro que está na gaveta: num mês em que a loja
    // depositou no banco mais do que entrou em espécie, o caixa aparecia negativo.
    db
      .select({
        total: sql<string>`COALESCE(SUM(
          CASE WHEN ${lancamentosCaixa.tipo} = 'entrada'
            THEN ${lancamentosCaixa.valor}::numeric
            ELSE -${lancamentosCaixa.valor}::numeric
          END
        ), 0)`,
      })
      .from(lancamentosCaixa)
      .where(and(
        lt(lancamentosCaixa.data, inicioMes),
        ne(lancamentosCaixa.statusAprovacao, 'reprovado'),
        lojaFiltroCaixa,
      )),

    // Receita, custo e quantidade por loja. O leftJoin mantém na tabela a loja que não
    // vendeu no mês — ela ainda carrega despesa, então some do resultado se cair fora.
    db
      .select({
        lojaId: lojas.id,
        lojaNome: lojas.nome,
        totalVendas:   sql<string>`COALESCE(SUM(${vendas.valor}), '0')`,
        totalLiquido:  sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), '0')`,
        totalCusto:    sql<string>`COALESCE(SUM(${motos.precoCompra}), '0')`,
        qtdSemCusto:   sql<string>`COUNT(${vendas.id}) FILTER (WHERE ${motos.precoCompra} IS NULL)`,
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

    db.execute(sql`
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
        lojaParamValido
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
        lojaParamValido
          ? sql`(${despesas.lojaId} = ${lojaParamValido} OR ${despesas.lojaId} IS NULL)`
          : undefined,
      )),

    // Regras de exclusão: categorias marcadas + CNPJ de fábrica.
    db
      .select({ nome: categoriasDespesa.nome })
      .from(categoriasDespesa)
      .where(eq(categoriasDespesa.contaComoDespesa, false)),

    db
      .select({ cnpj: favorecidosNaoOperacionais.cnpj, motivo: favorecidosNaoOperacionais.motivo })
      .from(favorecidosNaoOperacionais)
      .where(eq(favorecidosNaoOperacionais.grupoId, grupo.id)),

    // OS concluídas no período — valor de serviço (mão de obra) x peças usadas, separado
    // porque comissiona papéis diferentes (mecânico x aux. adm.) na Folha de Pagamento.
    db
      .select({
        totalServicos: sql<string>`COALESCE(SUM(${ordensServico.valorServicos}::numeric), 0)`,
        totalPecas:    sql<string>`COALESCE(SUM(${ordensServico.valorPecas}::numeric), 0)`,
      })
      .from(ordensServico)
      .where(and(
        eq(ordensServico.status, 'concluida'),
        gte(ordensServico.dataConclusao, inicioTs),
        lte(ordensServico.dataConclusao, fimTs),
        lojaFiltroOS,
      )),
  ])

  const receitaVendas = Number(totaisVendas[0]?.totalVendas ?? 0)
  const receitaLiquida = Number(totaisVendas[0]?.totalLiquido ?? 0)
  const qtdVendas = Number(totaisVendas[0]?.qtdVendas ?? 0)
  const entradasCaixa = Number(totaisCaixa.find(t => t.tipo === 'entrada')?.total ?? 0)
  const saidasCaixa = Number(totaisCaixa.find(t => t.tipo === 'saida')?.total ?? 0)
  const variacaoCaixaMes = entradasCaixa - saidasCaixa
  // O que está na gaveta hoje = o que já tinha + o movimento do mês.
  const saldoCaixa = Number(saldoAnteriorRaw[0]?.total ?? 0) + variacaoCaixaMes
  const taxasCartao = receitaVendas - receitaLiquida

  const resumoDespesas = somarDespesas(saidasBanco, manuaisForaDoBanco, {
    categoriasForaDoCalculo: new Set(categoriasForaRows.map(c => c.nome)),
    cnpjsForaDoCalculo:      new Map(cnpjsForaRows.map(c => [c.cnpj, c.motivo as MotivoForaDoCalculo])),
  })
  const totalDespesas = resumoDespesas.total
  const totalCusto = Number(totaisVendas[0]?.totalCusto ?? 0)
  const qtdSemCusto = Number(totaisVendas[0]?.qtdSemCusto ?? 0)
  const lucroBruto = receitaLiquida - totalCusto
  // Sem imposto estimado por alíquota: o imposto que a empresa paga já sai do extrato
  // como despesa (categoria "Impostos"). Descontar os dois contava o mesmo tributo
  // duas vezes — R$ 230 mil num mês de R$ 1,55 milhão no Sul de Minas.
  const lucroLiquido = lucroBruto - totalDespesas

  const totalServicosOS = Number(totaisOS[0]?.totalServicos ?? 0)
  const totalPecasOS    = Number(totaisOS[0]?.totalPecas ?? 0)

  // Mesma conta do card de lucro líquido acima, quebrada por loja. A despesa sem loja
  // atribuída é rateada na proporção do que cada uma faturou.
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

  const resumoPorPagamento = (resumoPorPagamentoRaw as any[]).map(r => ({
    tipo: r.tipo as string,
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

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Vendas no Período</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{qtdVendas}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Faturamento Bruto</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmt(receitaVendas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Receita Líquida</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-green-600">{fmt(receitaLiquida)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Taxas Cartão</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">-{fmt(taxasCartao)}</p>
            {receitaVendas > 0 && (
              <p className="text-xs text-slate-400">{((taxasCartao / receitaVendas) * 100).toFixed(1)}% do bruto</p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Entradas (Caixa)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{fmt(entradasCaixa)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saldo Caixa</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${saldoCaixa >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmt(saldoCaixa)}
            </p>
            {/* A variação vinha sozinha e passava por saldo: num mês de depósito alto o
                dinheiro em espécie aparecia negativo, o que nunca acontece de verdade. */}
            <p className="text-xs text-slate-400">
              dinheiro nas lojas · {variacaoCaixaMes >= 0 ? '+' : '−'}{fmt(Math.abs(variacaoCaixaMes))} no mês
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Despesas Operac.</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{totalDespesas > 0 ? '-' : ''}{fmt(totalDespesas)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Custo Total (Motos Vendidas)</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">{totalCusto > 0 ? '-' : ''}{fmt(totalCusto)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Lucro Bruto</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${lucroBruto >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmt(lucroBruto)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Lucro Líquido</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${lucroLiquido >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmt(lucroLiquido)}
            </p>
            <p className="text-xs text-slate-400">líquido − custo − despesas</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">OS · Serviços</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-teal-600">{fmt(totalServicosOS)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">OS · Peças</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-purple-600">{fmt(totalPecasOS)}</p>
          </CardContent>
        </Card>
      </div>

      {qtdSemCusto > 0 && (
        <p className="text-xs text-amber-600">
          ⚠ {qtdSemCusto} venda{qtdSemCusto > 1 ? 's' : ''} sem custo de moto registrado (conta{qtdSemCusto > 1 ? 'm' : ''} como R$ 0,00 no cálculo).
        </p>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResumoLojas resultado={resultadoLojas} />
        <ResumoPagamentos resumo={resumoPorPagamento} />
      </div>

      <ResumoVendedores resumo={resumoPorVendedor} />

      <ResumoDespesas resumo={resumoDespesas} />

      <Card>
        <CardHeader><CardTitle className="text-base">Vendas Realizadas</CardTitle></CardHeader>
        <CardContent>
          <VendasTable vendas={vendasMes} />
        </CardContent>
      </Card>
    </div>
  )
}
