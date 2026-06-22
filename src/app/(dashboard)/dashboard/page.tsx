import { unstable_cache } from 'next/cache'
import { db } from '@/lib/db'
import { lojas, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getKPIs, getVendasPorDia, getEstoquePorLoja, getVendasPorLoja, getUltimasVendas, getTransferenciasPendentes, getGarantiasProxVencimento, getOsAbertas, getMotoMaisVendida, getPrecoMedioVendas, getRankingVendedores, getRankingLojas, getModelosMaisVendidos } from '@/lib/queries/dashboard'
import { DashboardFiltros } from './components/dashboard-filtros'
import { KpiCards } from './components/kpi-cards'
import { GraficoVendasPorDia, GraficoEstoquePorLoja, GraficoVendasPorLoja } from './components/charts'
import { TabelaUltimasVendas, TabelaTransferenciasPendentes, TabelaGarantiasVencendo, TabelaOsAbertas, TabelaRankingVendedores, TabelaRankingLojas, TabelaModelosMaisVendidos } from './components/tabelas-resumo'

const getLojasOpts = unstable_cache(
  () => db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome),
  ['lojas-opts'],
  { revalidate: 300 }
)

const getVendedoresOpts = unstable_cache(
  () => db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.papel, 'vendedor')).orderBy(usuarios.nome),
  ['vendedores-opts'],
  { revalidate: 300 }
)

const ADMINS = ['admin_geral', 'admin_socio']

function getMesAtual() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function mesParaDatas(mes: string) {
  const [ano, mesNum] = mes.split('-').map(Number)
  const inicio = new Date(ano, mesNum - 1, 1)
  const fim = new Date(ano, mesNum, 0)
  return {
    inicio: inicio.toISOString().substring(0, 10),
    fim: fim.toISOString().substring(0, 10),
  }
}

function mesAnterior(mes: string) {
  const [ano, mesNum] = mes.split('-').map(Number)
  const d = new Date(ano, mesNum - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; loja?: string; vendedor?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)

  const mesDefault = getMesAtual()
  const mesSelecionado = params.mes ?? mesDefault
  const { inicio: dataInicio, fim: dataFim } = mesParaDatas(mesSelecionado)

  const mesAnt = mesAnterior(mesSelecionado)
  const { inicio: dataInicioAnt, fim: dataFimAnt } = mesParaDatas(mesAnt)

  const lojaIds: string[] = params.loja
    ? [params.loja]
    : (!isAdmin && usuario.lojaId ? [usuario.lojaId] : [])

  const filtros = {
    dataInicio,
    dataFim,
    lojaId: lojaIds.length ? lojaIds : undefined,
    vendedorId: isAdmin ? params.vendedor : (usuario.papel === 'vendedor' ? usuario.id : undefined),
  }

  const filtrosAnt = {
    dataInicio: dataInicioAnt,
    dataFim: dataFimAnt,
    lojaId: filtros.lojaId,
    vendedorId: filtros.vendedorId,
  }

  const mecanicoId = usuario.papel === 'mecanico' ? usuario.id : undefined

  const filtrosRanking = { dataInicio, dataFim }

  const [
    kpis,
    kpisAnt,
    vendasDia,
    estoqueLoja,
    vendasLoja,
    ultimasVendas,
    transfPendentes,
    garantiasVencendo,
    osAbertas,
    motoMaisVendida,
    precoMedio,
    rankingVendedores,
    rankingLojas,
    modelosMaisVendidos,
    lojasOpts,
    vendedoresOpts,
  ] = await Promise.all([
    getKPIs(filtros),
    getKPIs(filtrosAnt),
    getVendasPorDia(filtros),
    getEstoquePorLoja(filtros.lojaId),
    isAdmin ? getVendasPorLoja(filtros) : Promise.resolve([]),
    getUltimasVendas(filtros),
    getTransferenciasPendentes(filtros.lojaId),
    getGarantiasProxVencimento(filtros.lojaId),
    getOsAbertas(filtros.lojaId, mecanicoId),
    getMotoMaisVendida(filtros),
    getPrecoMedioVendas(filtros),
    getRankingVendedores(filtrosRanking),
    getRankingLojas(filtrosRanking),
    getModelosMaisVendidos(filtros),
    getLojasOpts(),
    getVendedoresOpts(),
  ])

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-slate-500 text-sm">
            {!isAdmin && usuario.lojaId
              ? `Resumo da loja ${lojasOpts.find(l => l.id === usuario.lojaId)?.nome ?? ''}`
              : 'Resumo da operação'}
          </p>
        </div>
        <DashboardFiltros
          lojas={lojasOpts}
          vendedores={vendedoresOpts}
          isAdmin={isAdmin}
          lojaUsuarioId={usuario.lojaId}
          mesDefault={mesDefault}
        />
      </div>

      <KpiCards
        kpis={kpis}
        kpisAnt={kpisAnt}
        papel={usuario.papel}
        motoMaisVendida={motoMaisVendida}
        precoMedio={precoMedio}
      />

      {usuario.papel === 'vendedor' ? (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GraficoVendasPorDia dados={vendasDia} />
            <TabelaModelosMaisVendidos modelos={modelosMaisVendidos} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TabelaRankingVendedores ranking={rankingVendedores} vendedorAtualId={usuario.id} />
            <TabelaRankingLojas ranking={rankingLojas} lojaAtualId={usuario.lojaId} />
          </div>

          <TabelaUltimasVendas vendas={ultimasVendas} />
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <GraficoVendasPorDia dados={vendasDia} />
            <GraficoEstoquePorLoja dados={estoqueLoja} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TabelaModelosMaisVendidos modelos={modelosMaisVendidos} />
            {isAdmin && <TabelaRankingLojas ranking={rankingLojas} />}
          </div>

          {isAdmin && vendasLoja.length > 0 && (
            <GraficoVendasPorLoja dados={vendasLoja} />
          )}

          <TabelaRankingVendedores ranking={rankingVendedores} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TabelaUltimasVendas vendas={ultimasVendas} />
            <TabelaTransferenciasPendentes transferencias={transfPendentes} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <TabelaGarantiasVencendo garantias={garantiasVencendo} />
            <TabelaOsAbertas ordens={osAbertas} />
          </div>
        </>
      )}
    </div>
  )
}
