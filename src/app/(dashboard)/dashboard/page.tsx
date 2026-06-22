import { Suspense } from 'react'
import { db } from '@/lib/db'
import { lojas, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import {
  getKPIs, getVendasPorDia, getEstoquePorLoja, getVendasPorLoja,
  getUltimasVendas, getTransferenciasPendentes, getGarantiasProxVencimento,
  getOsAbertas, getMotoMaisVendida, getPrecoMedioVendas,
  getRankingVendedores, getRankingLojas, getModelosMaisVendidos,
} from '@/lib/queries/dashboard'
import { DashboardFiltros } from './components/dashboard-filtros'
import { KpiCards } from './components/kpi-cards'
import { GraficoVendasPorDia, GraficoEstoquePorLoja, GraficoVendasPorLoja } from './components/charts'
import {
  TabelaUltimasVendas, TabelaTransferenciasPendentes, TabelaGarantiasVencendo,
  TabelaOsAbertas, TabelaRankingVendedores, TabelaRankingLojas, TabelaModelosMaisVendidos,
} from './components/tabelas-resumo'

type Filtros = { dataInicio: string; dataFim: string; lojaId?: string[]; vendedorId?: string }

const getLojasOpts = unstable_cache(
  () => db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).orderBy(lojas.nome),
  ['lojas-opts'], { revalidate: 300 },
)
const getVendedoresOpts = unstable_cache(
  () => db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios).where(eq(usuarios.papel, 'vendedor')).orderBy(usuarios.nome),
  ['vendedores-opts'], { revalidate: 300 },
)

// ── Seções async (stream independente) ────────────────────────────────────────

async function KpiSection({ filtros, filtrosAnt, papel }: { filtros: Filtros; filtrosAnt: Filtros; papel: string }) {
  const [kpis, kpisAnt, motoMaisVendida, precoMedio] = await Promise.all([
    getKPIs(filtros),
    getKPIs(filtrosAnt),
    getMotoMaisVendida(filtros),
    getPrecoMedioVendas(filtros),
  ])
  return <KpiCards kpis={kpis} kpisAnt={kpisAnt} papel={papel} motoMaisVendida={motoMaisVendida} precoMedio={precoMedio} />
}

async function GraficosSection({ filtros, isAdmin }: { filtros: Filtros; isAdmin: boolean }) {
  const [vendasDia, estoqueLoja, vendasLoja] = await Promise.all([
    getVendasPorDia(filtros),
    getEstoquePorLoja(filtros.lojaId),
    isAdmin ? getVendasPorLoja(filtros) : Promise.resolve([] as Awaited<ReturnType<typeof getVendasPorLoja>>),
  ])
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraficoVendasPorDia dados={vendasDia} />
        <GraficoEstoquePorLoja dados={estoqueLoja} />
      </div>
      {isAdmin && vendasLoja.length > 0 && <GraficoVendasPorLoja dados={vendasLoja} />}
    </>
  )
}

async function GraficoVendasSection({ filtros }: { filtros: Filtros }) {
  const vendasDia = await getVendasPorDia(filtros)
  return <GraficoVendasPorDia dados={vendasDia} />
}

async function RankingSection({
  filtros, filtrosRanking, vendedorAtualId, lojaAtualId,
}: { filtros: Filtros; filtrosRanking: { dataInicio: string; dataFim: string }; vendedorAtualId: string; lojaAtualId: string | null }) {
  const [rankingVendedores, rankingLojas, modelosMaisVendidos] = await Promise.all([
    getRankingVendedores(filtrosRanking),
    getRankingLojas(filtrosRanking),
    getModelosMaisVendidos(filtros),
  ])
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaModelosMaisVendidos modelos={modelosMaisVendidos} />
        <TabelaRankingLojas ranking={rankingLojas} lojaAtualId={lojaAtualId} />
      </div>
      <TabelaRankingVendedores ranking={rankingVendedores} vendedorAtualId={vendedorAtualId} />
    </>
  )
}

async function RankingAdminSection({
  filtros, filtrosRanking,
}: { filtros: Filtros; filtrosRanking: { dataInicio: string; dataFim: string } }) {
  const [rankingVendedores, rankingLojas, modelosMaisVendidos] = await Promise.all([
    getRankingVendedores(filtrosRanking),
    getRankingLojas(filtrosRanking),
    getModelosMaisVendidos(filtros),
  ])
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaModelosMaisVendidos modelos={modelosMaisVendidos} />
        <TabelaRankingLojas ranking={rankingLojas} />
      </div>
      <TabelaRankingVendedores ranking={rankingVendedores} />
    </>
  )
}

async function TabelasSection({
  filtros, lojaId, mecanicoId,
}: { filtros: Filtros; lojaId?: string[]; mecanicoId?: string }) {
  const [ultimasVendas, transfPendentes, garantiasVencendo, osAbertas] = await Promise.all([
    getUltimasVendas(filtros),
    getTransferenciasPendentes(lojaId),
    getGarantiasProxVencimento(lojaId),
    getOsAbertas(lojaId, mecanicoId),
  ])
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaUltimasVendas vendas={ultimasVendas} />
        <TabelaTransferenciasPendentes transferencias={transfPendentes} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaGarantiasVencendo garantias={garantiasVencendo} />
        <TabelaOsAbertas ordens={osAbertas} />
      </div>
    </>
  )
}

// ── Skeletons ─────────────────────────────────────────────────────────────────

function KpiSkeleton() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white border rounded-lg p-4 space-y-2">
          <div className="h-3 w-24 bg-slate-100 rounded" />
          <div className="h-7 w-20 bg-slate-200 rounded" />
          <div className="h-3 w-16 bg-slate-100 rounded" />
        </div>
      ))}
    </div>
  )
}

function SectionSkeleton({ rows = 2 }: { rows?: number }) {
  return (
    <div className="animate-pulse space-y-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="bg-white border rounded-lg h-48" />
      ))}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const ADMINS = ['admin_geral', 'admin_socio']

function getMesAtual() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

function mesParaDatas(mes: string) {
  const [ano, mesNum] = mes.split('-').map(Number)
  return {
    inicio: new Date(ano, mesNum - 1, 1).toISOString().substring(0, 10),
    fim: new Date(ano, mesNum, 0).toISOString().substring(0, 10),
  }
}

function mesAnterior(mes: string) {
  const [ano, mesNum] = mes.split('-').map(Number)
  const d = new Date(ano, mesNum - 2, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ mes?: string; loja?: string; vendedor?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)
  const isVendedor = usuario.papel === 'vendedor'

  const mesDefault = getMesAtual()
  const mesSelecionado = params.mes ?? mesDefault
  const { inicio: dataInicio, fim: dataFim } = mesParaDatas(mesSelecionado)
  const { inicio: dataInicioAnt, fim: dataFimAnt } = mesParaDatas(mesAnterior(mesSelecionado))

  const lojaIds: string[] = params.loja
    ? [params.loja]
    : (!isAdmin && usuario.lojaId ? [usuario.lojaId] : [])

  const filtros: Filtros = {
    dataInicio,
    dataFim,
    lojaId: lojaIds.length ? lojaIds : undefined,
    vendedorId: isAdmin ? params.vendedor : (isVendedor ? usuario.id : undefined),
  }

  const filtrosAnt: Filtros = {
    dataInicio: dataInicioAnt,
    dataFim: dataFimAnt,
    lojaId: filtros.lojaId,
    vendedorId: filtros.vendedorId,
  }

  const filtrosRanking = { dataInicio, dataFim }
  const mecanicoId = usuario.papel === 'mecanico' ? usuario.id : undefined

  const [lojasOpts, vendedoresOpts] = await Promise.all([getLojasOpts(), getVendedoresOpts()])

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

      <Suspense fallback={<KpiSkeleton />}>
        <KpiSection filtros={filtros} filtrosAnt={filtrosAnt} papel={usuario.papel} />
      </Suspense>

      {isVendedor ? (
        <>
          <Suspense fallback={<SectionSkeleton />}>
            <GraficoVendasSection filtros={filtros} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <RankingSection
              filtros={filtros}
              filtrosRanking={filtrosRanking}
              vendedorAtualId={usuario.id}
              lojaAtualId={usuario.lojaId}
            />
          </Suspense>
          <Suspense fallback={<SectionSkeleton />}>
            <TabelaUltimasVendasSection filtros={filtros} />
          </Suspense>
        </>
      ) : (
        <>
          <Suspense fallback={<SectionSkeleton rows={2} />}>
            <GraficosSection filtros={filtros} isAdmin={isAdmin} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={3} />}>
            <RankingAdminSection filtros={filtros} filtrosRanking={filtrosRanking} />
          </Suspense>
          <Suspense fallback={<SectionSkeleton rows={2} />}>
            <TabelasSection filtros={filtros} lojaId={filtros.lojaId} mecanicoId={mecanicoId} />
          </Suspense>
        </>
      )}
    </div>
  )
}

async function TabelaUltimasVendasSection({ filtros }: { filtros: Filtros }) {
  const ultimasVendas = await getUltimasVendas(filtros)
  return <TabelaUltimasVendas vendas={ultimasVendas} />
}
