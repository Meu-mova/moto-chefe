import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { vendas, lancamentosCaixa, lojas, usuarios, motos, modelos } from '@/lib/db/schema'
import { eq, desc, and, gte, lte, sql, count } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FinanceiroFiltros } from './components/financeiro-filtros'
import { VendasTable } from './components/vendas-table'
import { ResumoLojas } from './components/resumo-lojas'

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

  const [vendasMes, totaisVendas, totaisCaixa, resumoPorLoja, lojasOpts] = await Promise.all([
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
  ])

  const receitaVendas = Number(totaisVendas[0]?.totalVendas ?? 0)
  const qtdVendas = Number(totaisVendas[0]?.qtdVendas ?? 0)
  const entradasCaixa = Number(totaisCaixa.find(t => t.tipo === 'entrada')?.total ?? 0)
  const saidasCaixa = Number(totaisCaixa.find(t => t.tipo === 'saida')?.total ?? 0)
  const saldoCaixa = entradasCaixa - saidasCaixa

  function fmt(v: number) {
    return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Financeiro</h1>

      <FinanceiroFiltros lojas={lojasOpts} mesAtual={mesParam} lojaAtual={lojaParam} />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Vendas no Período</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{qtdVendas}</p>
            <p className="text-sm text-slate-400">{fmt(receitaVendas)} em receita</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Entradas (Caixa)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-600">{fmt(entradasCaixa)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saídas (Caixa)</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-red-600">{fmt(saidasCaixa)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Saldo Caixa</CardTitle></CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${saldoCaixa >= 0 ? 'text-green-600' : 'text-red-600'}`}>
              {fmt(saldoCaixa)}
            </p>
          </CardContent>
        </Card>
      </div>

      <ResumoLojas resumo={resumoPorLoja} />

      <Card>
        <CardHeader><CardTitle className="text-base">Vendas Realizadas</CardTitle></CardHeader>
        <CardContent>
          <VendasTable vendas={vendasMes} />
        </CardContent>
      </Card>
    </div>
  )
}
