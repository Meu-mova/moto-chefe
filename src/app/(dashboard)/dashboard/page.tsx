import { db } from '@/lib/db'
import { lojas, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getKPIs, getVendasPorDia, getEstoquePorLoja, getVendasPorLoja, getUltimasVendas, getTransferenciasPendentes, getGarantiasProxVencimento, getOsAbertas } from '@/lib/queries/dashboard'
import { DashboardFiltros } from './components/dashboard-filtros'
import { KpiCards } from './components/kpi-cards'
import { GraficoVendasPorDia, GraficoEstoquePorLoja, GraficoVendasPorLoja } from './components/charts'
import { TabelaUltimasVendas, TabelaTransferenciasPendentes, TabelaGarantiasVencendo, TabelaOsAbertas } from './components/tabelas-resumo'

const ADMINS = ['admin_geral', 'admin_socio']

function getDefaultDates() {
  const now = new Date()
  const inicio = new Date(now.getFullYear(), now.getMonth(), 1)
  const fim = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  return {
    inicio: inicio.toISOString().substring(0, 10),
    fim: fim.toISOString().substring(0, 10),
  }
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; loja?: string; vendedor?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)
  const defaults = getDefaultDates()

  const dataInicio = params.de ?? defaults.inicio
  const dataFim = params.ate ?? defaults.fim

  const lojaIds: string[] = params.loja
    ? [params.loja]
    : (!isAdmin && usuario.lojaId ? [usuario.lojaId] : [])

  const filtros = {
    dataInicio,
    dataFim,
    lojaId: lojaIds.length ? lojaIds : undefined,
    vendedorId: isAdmin ? params.vendedor : (usuario.papel === 'vendedor' ? usuario.id : undefined),
  }

  const mecanicoId = usuario.papel === 'mecanico' ? usuario.id : undefined

  const [
    kpis,
    vendasDia,
    estoqueLoja,
    vendasLoja,
    ultimasVendas,
    transfPendentes,
    garantiasVencendo,
    osAbertas,
    lojasOpts,
    vendedoresOpts,
  ] = await Promise.all([
    getKPIs(filtros),
    getVendasPorDia(filtros),
    getEstoquePorLoja(filtros.lojaId),
    isAdmin ? getVendasPorLoja(filtros) : Promise.resolve([]),
    getUltimasVendas(filtros),
    getTransferenciasPendentes(filtros.lojaId),
    getGarantiasProxVencimento(filtros.lojaId),
    getOsAbertas(filtros.lojaId, mecanicoId),
    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome),
    db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.papel, 'vendedor')).orderBy(usuarios.nome),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-slate-500 text-sm">Resumo da operação</p>
        </div>
        <DashboardFiltros
          lojas={lojasOpts}
          vendedores={vendedoresOpts}
          isAdmin={isAdmin}
          lojaUsuarioId={usuario.lojaId}
          dataInicioDefault={defaults.inicio}
          dataFimDefault={defaults.fim}
        />
      </div>

      <KpiCards kpis={kpis} papel={usuario.papel} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraficoVendasPorDia dados={vendasDia} />
        <GraficoEstoquePorLoja dados={estoqueLoja} />
      </div>

      {isAdmin && vendasLoja.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <GraficoVendasPorLoja dados={vendasLoja} />
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaUltimasVendas vendas={ultimasVendas} />
        {usuario.papel !== 'vendedor' && (
          <TabelaTransferenciasPendentes transferencias={transfPendentes} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {usuario.papel !== 'vendedor' && (
          <TabelaGarantiasVencendo garantias={garantiasVencendo} />
        )}
        <TabelaOsAbertas ordens={osAbertas} />
      </div>
    </div>
  )
}
