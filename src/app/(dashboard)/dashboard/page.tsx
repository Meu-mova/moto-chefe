import { Suspense } from 'react'
import { db } from '@/lib/db'
import { usuarios, conciliacoesCartao, premiacaoFaixas, funcionariosConfig, vendas } from '@/lib/db/schema'
import { eq, or, sql, and, count, gte, lt, inArray } from 'drizzle-orm'
import { unstable_cache } from 'next/cache'
import { getUsuarioLogado, temPapel } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo, getGrupoAtivo } from '@/lib/grupo'
import {
  getKPIs, getVendasPorDia, getEstoquePorLoja, getSaldoCaixaPorLoja,
  getUltimasVendas, getTransferenciasPendentes, getGarantiasProxVencimento,
  getOsAbertas, getMotoMaisVendida, getFaturamentoOS,
  getRankingVendedores, getRankingLojas, getModelosMaisVendidos,
  getPendenciasConciliacaoLoja,
} from '@/lib/queries/dashboard'
import { placarVendedor, fechamentoSemTarefa } from '@/lib/queries/atendimento'
import { getKommoStatus } from '@/lib/kommo'
import { PlacarVendedor } from './components/placar-vendedor'
import { AlertaFechamento } from './components/alerta-fechamento'
import { MetaMesCards } from './components/meta-mes-cards'
import { calcularProjecao, hojeEmBrasilia } from '@/lib/meta-vendas'
import { DashboardFiltros } from './components/dashboard-filtros'
import { PendenciasLojaCard } from './components/pendencias-loja-card'
import { KpiCards } from './components/kpi-cards'
import { SimuladorComissaoOTE } from './components/simulador-comissao'
import { GraficoVendasPorDia, GraficoEstoquePorLoja, GraficoCaixaPorLoja } from './components/charts'
import {
  TabelaUltimasVendas, TabelaTransferenciasPendentes, TabelaGarantiasVencendo,
  TabelaOsAbertas, TabelaRankingVendedores, TabelaRankingLojas, TabelaModelosMaisVendidos,
} from './components/tabelas-resumo'
import { SectionErrorBoundary } from './section-error-boundary'

type Filtros = { dataInicio: string; dataFim: string; lojaId?: string[]; vendedorId?: string }

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms`)), ms)),
  ])
}

const getVendedoresOpts = unstable_cache(
  () => db.select({ id: usuarios.id, nome: usuarios.nome }).from(usuarios)
    // Inclui quem vende sem ter 'vendedor' como papel principal — senão o filtro
    // de vendedor esconde as vendas dessas pessoas.
    .where(or(eq(usuarios.papel, 'vendedor'), sql`'vendedor' = ANY(${usuarios.papeisExtras})`))
    .orderBy(usuarios.nome),
  ['vendedores-opts'], { revalidate: 300 },
)

// ── Seções async ──────────────────────────────────────────────────────────────

async function KpiSection({
  filtros, filtrosAnt, usuario,
}: { filtros: Filtros; filtrosAnt: Filtros; usuario: { id: string; papel: string; papeisExtras?: string[] | null; lojaId: string | null } }) {
  const papel = usuario.papel
  const isAdmin = ADMINS.includes(papel)
  const isVendedor = temPapel(usuario, 'vendedor')
  const kpiOpts = isVendedor ? { useLiquidoValue: true } : undefined
  try {
    const [kpis, kpisAnt, motoMaisVendida, conciliacaoPendentes, faturamentoOS, faixasOTE, config] = await withTimeout(
      Promise.all([
        getKPIs(filtros, kpiOpts),
        getKPIs(filtrosAnt, kpiOpts),
        getMotoMaisVendida(filtros),
        isAdmin
          ? db.$count(conciliacoesCartao, eq(conciliacoesCartao.conciliado, false))
          : Promise.resolve(0),
        isVendedor ? Promise.resolve({ servicos: 0, pecas: 0 }) : getFaturamentoOS(filtros),
        isVendedor ? getGrupoAtivo(usuario).then(g => db.select().from(premiacaoFaixas).where(eq(premiacaoFaixas.grupoId, g.id))) : Promise.resolve([]),
        isVendedor ? db.select().from(funcionariosConfig).where(eq(funcionariosConfig.usuarioId, usuario.id)).then(r => r[0]) : Promise.resolve(undefined),
      ]),
      25000,
    )
    const comissaoPercentual = config ? parseFloat(config.comissaoPercentual) : 0.5
    return (
      <>
        <KpiCards kpis={kpis} kpisAnt={kpisAnt} papel={papel} isVendedor={isVendedor} motoMaisVendida={motoMaisVendida} conciliacaoPendentes={conciliacaoPendentes} faturamentoOS={faturamentoOS} faixasOTE={faixasOTE} />
        {isVendedor && (
          <SimuladorComissaoOTE faixas={faixasOTE} comissaoPercentual={comissaoPercentual} valorInicial={kpis.faturamento} />
        )}
      </>
    )
  } catch (e) {
    console.error('[KpiSection] erro:', e)
    throw e
  }
}

async function PendenciasSection({ lojaId }: { lojaId: string }) {
  const desde = new Date()
  desde.setDate(desde.getDate() - 30)
  try {
    const pendencias = await getPendenciasConciliacaoLoja(lojaId, desde)
    return <PendenciasLojaCard {...pendencias} />
  } catch (e) {
    console.error('[PendenciasSection] erro:', e)
    throw e
  }
}

async function GraficosSection({ filtros, isAdmin }: { filtros: Filtros; isAdmin: boolean }) {
  let vendasDia: Awaited<ReturnType<typeof getVendasPorDia>>,
      estoqueLoja: Awaited<ReturnType<typeof getEstoquePorLoja>>,
      saldoCaixaLoja: Awaited<ReturnType<typeof getSaldoCaixaPorLoja>>
  try {
    ;[vendasDia, estoqueLoja, saldoCaixaLoja] = await withTimeout(
      Promise.all([
        getVendasPorDia(filtros),
        getEstoquePorLoja(filtros.lojaId),
        isAdmin ? getSaldoCaixaPorLoja(filtros.lojaId) : Promise.resolve([] as Awaited<ReturnType<typeof getSaldoCaixaPorLoja>>),
      ]),
      25000,
    )
  } catch (e) {
    console.error('[GraficosSection] erro:', e)
    throw e
  }
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <GraficoVendasPorDia dados={vendasDia} />
        <GraficoEstoquePorLoja dados={estoqueLoja} />
      </div>
      {isAdmin && saldoCaixaLoja.length > 0 && <GraficoCaixaPorLoja dados={saldoCaixaLoja} />}
    </>
  )
}

async function RankingSection({
  filtros, filtrosRanking,
}: { filtros: Filtros; filtrosRanking: { dataInicio: string; dataFim: string } }) {
  let rankingVendedores: Awaited<ReturnType<typeof getRankingVendedores>>,
      rankingLojas: Awaited<ReturnType<typeof getRankingLojas>>,
      modelosMaisVendidos: Awaited<ReturnType<typeof getModelosMaisVendidos>>
  try {
    ;[rankingVendedores, rankingLojas, modelosMaisVendidos] = await withTimeout(
      Promise.all([getRankingVendedores(filtrosRanking), getRankingLojas(filtrosRanking), getModelosMaisVendidos(filtros)]),
      25000,
    )
  } catch (e) {
    console.error('[RankingSection] erro:', e)
    throw e
  }
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
  filtros, lojaId, mecanicoId, isVendedor,
}: { filtros: Filtros; lojaId?: string[]; mecanicoId?: string; isVendedor: boolean }) {
  let ultimasVendas: Awaited<ReturnType<typeof getUltimasVendas>>,
      transfPendentes: Awaited<ReturnType<typeof getTransferenciasPendentes>>,
      garantiasVencendo: Awaited<ReturnType<typeof getGarantiasProxVencimento>>,
      osAbertas: Awaited<ReturnType<typeof getOsAbertas>>
  try {
    ;[ultimasVendas, transfPendentes, garantiasVencendo, osAbertas] = await withTimeout(
      Promise.all([
        getUltimasVendas(filtros),
        getTransferenciasPendentes(lojaId),
        isVendedor ? Promise.resolve([] as Awaited<ReturnType<typeof getGarantiasProxVencimento>>) : getGarantiasProxVencimento(lojaId),
        isVendedor ? Promise.resolve([] as Awaited<ReturnType<typeof getOsAbertas>>) : getOsAbertas(lojaId, mecanicoId),
      ]),
      25000,
    )
  } catch (e) {
    console.error('[TabelasSection] erro:', e)
    throw e
  }
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaUltimasVendas vendas={ultimasVendas} />
        <TabelaTransferenciasPendentes transferencias={transfPendentes} />
      </div>
      {!isVendedor && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <TabelaGarantiasVencendo garantias={garantiasVencendo} />
          <TabelaOsAbertas ordens={osAbertas} />
        </div>
      )}
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

function SectionSkeleton({ rows = 1 }: { rows?: number }) {
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

// Meta de motos do mês da bandeira ativa, com projeção de fechamento no ritmo atual.
// Sempre o mês corrente, independente do filtro de período do dashboard: meta é do mês,
// não do intervalo que o usuário escolheu olhar.
async function MetaSection({ usuario }: { usuario: { id: string; papel: string; lojaId: string | null } }) {
  const grupo = await getGrupoAtivo(usuario)
  if (!grupo.metaMotosMes) return null

  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)
  if (lojaIds.length === 0) return null

  const { ano, mes, dia } = hojeEmBrasilia()
  const inicioMes = new Date(Date.UTC(ano, mes - 1, 1))
  const inicioProximoMes = new Date(Date.UTC(ano, mes, 1))
  const inicioHoje = new Date(Date.UTC(ano, mes - 1, dia))
  const inicioAmanha = new Date(Date.UTC(ano, mes - 1, dia + 1))

  const [[doMes], [deHoje]] = await Promise.all([
    db.select({ qtd: count() }).from(vendas).where(and(
      inArray(vendas.lojaId, lojaIds),
      gte(vendas.dataVenda, inicioMes),
      lt(vendas.dataVenda, inicioProximoMes),
    )),
    db.select({ qtd: count() }).from(vendas).where(and(
      inArray(vendas.lojaId, lojaIds),
      gte(vendas.dataVenda, inicioHoje),
      lt(vendas.dataVenda, inicioAmanha),
    )),
  ])

  const projecao = calcularProjecao({
    meta: grupo.metaMotosMes,
    vendidas: Number(doMes?.qtd ?? 0),
    ano, mes, dia,
  })

  return (
    <MetaMesCards projecao={projecao} grupoNome={grupo.nome} vendasHoje={Number(deHoje?.qtd ?? 0)} />
  )
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Placar de atendimento (Kommo) do vendedor logado — só lê o cache, não sincroniza.
async function PlacarSection({ usuario, dataInicio, dataFim }: { usuario: { id: string; papel: string; lojaId: string | null }; dataInicio: string; dataFim: string }) {
  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)
  const inicio = new Date(dataInicio + 'T00:00:00')
  const fim = new Date(dataFim + 'T23:59:59')
  const placar = await placarVendedor(usuario.id, inicio, fim, dataInicio, dataFim, lojaIds)
  if (!placar) return null
  return <PlacarVendedor placar={placar} mes={MESES[inicio.getMonth()]} />
}

// Leads em interesse/negociação sem tarefa agendada — foto do agora, ignora o
// filtro de período. Só lê o cache, não sincroniza.
async function FechamentoSection({ usuario }: { usuario: { id: string; papel: string; lojaId: string | null } }) {
  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)
  const [dados, status] = await Promise.all([
    fechamentoSemTarefa(lojaIds, usuario.id),
    getKommoStatus(),
  ])
  if (!status.conectado || dados.naEtapa === 0) return null
  return <AlertaFechamento dados={dados} subdominio={status.subdominio} />
}

function hojeISO() {
  return new Date().toISOString().substring(0, 10)
}

function inicioMesAtualISO() {
  const now = new Date()
  return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10)
}

// Período de comparação: mesma duração do período selecionado, terminando um dia antes dele.
function periodoAnterior(dataInicio: string, dataFim: string) {
  const inicio = new Date(dataInicio + 'T00:00:00')
  const fim = new Date(dataFim + 'T00:00:00')
  const duracaoMs = fim.getTime() - inicio.getTime()
  const fimAnterior = new Date(inicio.getTime() - 24 * 60 * 60 * 1000)
  const inicioAnterior = new Date(fimAnterior.getTime() - duracaoMs)
  return {
    inicio: inicioAnterior.toISOString().substring(0, 10),
    fim: fimAnterior.toISOString().substring(0, 10),
  }
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string; ate?: string; loja?: string; vendedor?: string }>
}) {
  const params = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)
  const isVendedor = temPapel(usuario, 'vendedor')
  const isAuxAdm = usuario.papel === 'aux_adm'

  const deDefault = inicioMesAtualISO()
  const ateDefault = hojeISO()
  const dataInicio = params.de ?? deDefault
  const dataFim = params.ate ?? ateDefault
  const { inicio: dataInicioAnt, fim: dataFimAnt } = periodoAnterior(dataInicio, dataFim)

  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : []
  const lojaIdsPermitidos = isAdmin ? lojaIdsGrupo : (usuario.lojaId ? [usuario.lojaId] : [])
  const lojaIds: string[] = params.loja && lojaIdsPermitidos.includes(params.loja)
    ? [params.loja]
    : lojaIdsPermitidos

  const filtros: Filtros = {
    dataInicio,
    dataFim,
    // Admin sempre recebe o array concreto (mesmo vazio, quando o grupo ativo não tem lojas) para
    // que os filtros das queries apliquem "inArray([])" e não vazem dados de outros grupos.
    // Não-admin sem loja associada (caso legado/defensivo) preserva undefined = sem filtro.
    lojaId: (isAdmin || usuario.lojaId) ? lojaIds : undefined,
    vendedorId: isAdmin ? params.vendedor : (isVendedor ? usuario.id : undefined),
  }

  const filtrosAnt: Filtros = {
    dataInicio: dataInicioAnt,
    dataFim: dataFimAnt,
    lojaId: filtros.lojaId,
    vendedorId: filtros.vendedorId,
  }

  const filtrosRanking = { dataInicio, dataFim, lojaId: filtros.lojaId }
  const mecanicoId = usuario.papel === 'mecanico' ? usuario.id : undefined
  const filtroKey = `${dataInicio}_${dataFim}-${lojaIds.join(',')}-${filtros.vendedorId ?? ''}`

  const [lojasOpts, vendedoresOpts] = await withTimeout(
    Promise.all([listarLojasDoGrupoAtivo(usuario), getVendedoresOpts()]),
    8000,
  )

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-slate-500 text-sm">
            {!isAdmin && usuario.lojaId
              ? `Resumo da loja`
              : 'Resumo da operação'}
          </p>
        </div>
        <DashboardFiltros
          lojas={lojasOpts}
          vendedores={vendedoresOpts}
          isAdmin={isAdmin}
          lojaUsuarioId={usuario.lojaId}
          deDefault={deDefault}
          ateDefault={ateDefault}
        />
      </div>

      {isAuxAdm && usuario.lojaId && (
        <SectionErrorBoundary label="as pendências da loja">
          <Suspense fallback={null}>
            <PendenciasSection lojaId={usuario.lojaId} />
          </Suspense>
        </SectionErrorBoundary>
      )}

      {isVendedor && (
        <SectionErrorBoundary label="o alerta de fechamento">
          <Suspense fallback={null}>
            <FechamentoSection usuario={usuario} />
          </Suspense>
        </SectionErrorBoundary>
      )}

      {isVendedor && (
        <SectionErrorBoundary key={`placar-${filtroKey}`} label="o placar de atendimento">
          <Suspense fallback={null}>
            <PlacarSection usuario={usuario} dataInicio={dataInicio} dataFim={dataFim} />
          </Suspense>
        </SectionErrorBoundary>
      )}

      {isAdmin && (
        <SectionErrorBoundary label="a meta do mês">
          <Suspense fallback={null}>
            <MetaSection usuario={usuario} />
          </Suspense>
        </SectionErrorBoundary>
      )}

      <SectionErrorBoundary key={`kpi-${filtroKey}`} label="os KPIs">
        <Suspense fallback={<KpiSkeleton />}>
          <KpiSection filtros={filtros} filtrosAnt={filtrosAnt} usuario={usuario} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary key={`graficos-${filtroKey}`} label="os gráficos">
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <GraficosSection filtros={filtros} isAdmin={isAdmin} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary key={`ranking-${filtroKey}`} label="o ranking">
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <RankingSection filtros={filtros} filtrosRanking={filtrosRanking} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary key={`tabelas-${filtroKey}`} label="as tabelas">
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <TabelasSection filtros={filtros} lojaId={filtros.lojaId} mecanicoId={mecanicoId} isVendedor={isVendedor} />
        </Suspense>
      </SectionErrorBoundary>
    </div>
  )
}
