import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { vendas, lancamentosCaixa, lojas, usuarios, motos, modelos, conciliacoesCartao, despesas } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql, count } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FinanceiroFiltros } from './components/financeiro-filtros'
import { VendasTable } from './components/vendas-table'
import { ResumoLojas } from './components/resumo-lojas'
import { ResumoVendedores } from './components/resumo-vendedores'
import { ResumoPagamentos } from './components/resumo-pagamentos'
import { ResumoDespesas } from './components/resumo-despesas'

function valorLiquidoExpr() {
  return sql`COALESCE(
    (SELECT SUM(${conciliacoesCartao.valorLiquido}::numeric)
     FROM ${conciliacoesCartao}
     WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
       AND ${conciliacoesCartao.conciliado} = true),
    ${vendas.valor}::numeric
  )`
}

export default async function FinanceiroPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) redirect('/dashboard')

  const params = await searchParams
  const mesParam = params.mes ?? new Date().toISOString().slice(0, 7)
  const lojaParam = params.loja ?? ''

  const [ano, mes] = mesParam.split('-').map(Number)
  const inicioMes = `${mesParam}-01`
  const ultimoDia = new Date(ano, mes, 0).toISOString().split('T')[0]
  const inicioTs = new Date(`${inicioMes}T00:00:00Z`)
  const fimTs = new Date(`${ano}-${String(mes + 1).padStart(2, '0')}-01T00:00:00Z`)

  const lojaFiltroVendas = lojaParam ? eq(vendas.lojaId, lojaParam) : undefined
  const lojaFiltroCaixa = lojaParam ? eq(lancamentosCaixa.lojaId, lojaParam) : undefined
  const lojaCondPagamento = lojaParam ? sql`AND ${vendas.lojaId} = ${lojaParam}` : sql``

  const [vendasMes, totaisVendas, totaisCaixa, resumoPorLoja, lojasOpts, resumoPorVendedor, resumoPorPagamentoRaw, totalDespesasRaw, despesasPorCategoria] = await Promise.all([
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
        qtdVendas: count(),
      })
      .from(vendas)
      .where(and(
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
        lojaFiltroVendas,
      )),

    db
      .select({
        tipo: lancamentosCaixa.tipo,
        total: sql<string>`COALESCE(SUM(${lancamentosCaixa.valor}), '0')`,
      })
      .from(lancamentosCaixa)
      .where(and(
        gte(lancamentosCaixa.data, inicioMes),
        lte(lancamentosCaixa.data, ultimoDia),
        lojaFiltroCaixa,
      ))
      .groupBy(lancamentosCaixa.tipo),

    db
      .select({
        lojaId: lojas.id,
        lojaNome: lojas.nome,
        totalVendas: sql<string>`COALESCE(SUM(${vendas.valor}), '0')`,
        qtdVendas: count(),
      })
      .from(lojas)
      .leftJoin(vendas, and(
        eq(vendas.lojaId, lojas.id),
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
      ))
      .groupBy(lojas.id, lojas.nome)
      .orderBy(lojas.nome),

    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome),

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

    // Total de despesas do período (loja filtrada + gerais)
    db
      .select({
        total: sql<string>`COALESCE(SUM(${despesas.valor}), '0')`,
      })
      .from(despesas)
      .where(and(
        gte(despesas.data, inicioMes),
        lte(despesas.data, ultimoDia),
        lojaParam
          ? sql`(${despesas.lojaId} = ${lojaParam} OR ${despesas.lojaId} IS NULL)`
          : undefined,
      )),

    // Despesas agrupadas por categoria
    db
      .select({
        categoria: despesas.categoria,
        total:     sql<string>`COALESCE(SUM(${despesas.valor}), '0')`,
      })
      .from(despesas)
      .where(and(
        gte(despesas.data, inicioMes),
        lte(despesas.data, ultimoDia),
        lojaParam
          ? sql`(${despesas.lojaId} = ${lojaParam} OR ${despesas.lojaId} IS NULL)`
          : undefined,
      ))
      .groupBy(despesas.categoria)
      .orderBy(sql`SUM(${despesas.valor}) DESC`),
  ])

  const receitaVendas = Number(totaisVendas[0]?.totalVendas ?? 0)
  const receitaLiquida = Number(totaisVendas[0]?.totalLiquido ?? 0)
  const qtdVendas = Number(totaisVendas[0]?.qtdVendas ?? 0)
  const entradasCaixa = Number(totaisCaixa.find(t => t.tipo === 'entrada')?.total ?? 0)
  const saidasCaixa = Number(totaisCaixa.find(t => t.tipo === 'saida')?.total ?? 0)
  const saldoCaixa = entradasCaixa - saidasCaixa
  const taxasCartao = receitaVendas - receitaLiquida
  const totalDespesas = Number(totalDespesasRaw[0]?.total ?? 0)

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

      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
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
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Despesas Operac.</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-red-600">-{fmt(totalDespesas)}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ResumoLojas resumo={resumoPorLoja} />
        <ResumoPagamentos resumo={resumoPorPagamento} />
      </div>

      <ResumoVendedores resumo={resumoPorVendedor} />

      <ResumoDespesas total={totalDespesas} porCategoria={despesasPorCategoria} />

      <Card>
        <CardHeader><CardTitle className="text-base">Vendas Realizadas</CardTitle></CardHeader>
        <CardContent>
          <VendasTable vendas={vendasMes} />
        </CardContent>
      </Card>
    </div>
  )
}
