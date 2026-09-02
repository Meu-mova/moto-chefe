import { Suspense } from 'react'
import { hojeBrt } from '@/lib/data-venda'
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
import { descontosPorVendedor, totalDescontos } from '@/lib/queries/descontos'
import { INICIO_CONCILIACAO } from '@/lib/conciliacao-periodo'
import { periodoAnteriorAoRegistro } from '@/lib/desconto'
import { painelAtendimento } from '@/lib/queries/atendimento'
import { getKommoStatus } from '@/lib/kommo'
import { PainelAtendimento } from './components/painel-atendimento'
import { MetaMesCards } from './components/meta-mes-cards'
import { montarMetaDoMes, hojeEmBrasilia } from '@/lib/meta-vendas'
import { linhasMetaDoMes, vendidoNoDia } from '@/lib/queries/metas'
import { DashboardFiltros } from './components/dashboard-filtros'
import { PendenciasLojaCard } from './components/pendencias-loja-card'
import { PendenciasDocumentosCard } from './components/pendencias-documentos-card'
import { pendenciasDeVendas } from '@/lib/queries/pendencias-venda'
import { PedidosFabricaCard } from './components/pedidos-fabrica-card'
import { pedidosFabricaDoGrupo } from '@/lib/queries/pedidos-fabrica'
import { KpiCards } from './components/kpi-cards'
import { SimuladorComissaoOTE } from './components/simulador-comissao'
import { GraficoVendasPorDia, GraficoEstoquePorLoja, GraficoCaixaPorLoja } from './components/charts'
import {
  TabelaUltimasVendas, TabelaTransferenciasPendentes, TabelaGarantiasVencendo,
  TabelaOsAbertas, TabelaRankingVendedores, TabelaRankingLojas, TabelaModelosMaisVendidos,
} from './components/tabelas-resumo'
import { SectionErrorBoundary } from './section-error-boundary'
import { proximosEventos } from '@/lib/queries/calendario'
import { ProximosEventosCard } from './components/proximos-eventos-card'
import { listarContasDoMesAction } from '../contas-pagar/actions'
import { ContasPagarCard } from './components/contas-pagar-card'

// O botão "Atualizar" do card da fábrica roda por Server Action nesta rota, e
// ele faz login + scraping no portal, uma conta por loja. Não cabe no default.
export const maxDuration = 300

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
  const isAuxAdm = papel === 'aux_adm'
  const isVendedor = temPapel(usuario, 'vendedor')
  const kpiOpts = isVendedor ? { useLiquidoValue: true } : undefined
  try {
    const [kpis, kpisAnt, motoMaisVendida, conciliacaoPendentes, faturamentoOS, faixasOTE, config, descontos] = await withTimeout(
      Promise.all([
        getKPIs(filtros, kpiOpts),
        getKPIs(filtrosAnt, kpiOpts),
        getMotoMaisVendida(filtros),
        isAdmin
          // Mesmo corte da tela de /conciliacao, senão o card mostra um número
          // de pendentes que a tela não lista — ver INICIO_CONCILIACAO.
          ? db.$count(conciliacoesCartao, and(
              eq(conciliacoesCartao.conciliado, false),
              gte(conciliacoesCartao.dataTransacao, INICIO_CONCILIACAO),
            ))
          : Promise.resolve(0),
        isVendedor ? Promise.resolve({ servicos: 0, pecas: 0 }) : getFaturamentoOS(filtros),
        isVendedor ? getGrupoAtivo(usuario).then(g => db.select().from(premiacaoFaixas).where(eq(premiacaoFaixas.grupoId, g.id))) : Promise.resolve([]),
        isVendedor ? db.select().from(funcionariosConfig).where(eq(funcionariosConfig.usuarioId, usuario.id)).then(r => r[0]) : Promise.resolve(undefined),
        // O vendedor vê só o próprio desconto porque filtros.vendedorId já é o id dele.
        // Mecânico e afins não recebem o card.
        (isAdmin || isAuxAdm || isVendedor)
          ? totalDescontos({ ...filtros, vendedorId: filtros.vendedorId ? [filtros.vendedorId] : undefined })
          : Promise.resolve(undefined),
      ]),
      25000,
    )
    const comissaoPercentual = config ? parseFloat(config.comissaoPercentual) : 0.5
    return (
      <>
        <KpiCards kpis={kpis} kpisAnt={kpisAnt} papel={papel} isVendedor={isVendedor} motoMaisVendida={motoMaisVendida} conciliacaoPendentes={conciliacaoPendentes} faturamentoOS={faturamentoOS} faixasOTE={faixasOTE} descontos={descontos} />
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

// Quem paga a fábrica é o administrativo: admin, sócio e aux_adm. O card é por
// GRUPO (cada bandeira tem suas contas no portal), não por loja do usuário.
async function PedidosFabricaSection({
  usuario,
}: {
  usuario: { papel: string; lojaId: string | null }
}) {
  try {
    const grupo = await getGrupoAtivo(usuario)
    const dados = await pedidosFabricaDoGrupo(grupo.id)
    return <PedidosFabricaCard dados={dados} />
  } catch (e) {
    console.error('[PedidosFabricaSection] erro:', e)
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

// Contrato, checklist, NF e conciliação das vendas desde que a regra entrou no ar.
// Não recebe `filtros` de propósito: o período é sempre desde INICIO_REGRA_DOCUMENTOS,
// senão a pendência de agosto sumiria da tela em setembro sem ninguém resolver.
async function PendenciasDocumentosSection({
  usuario, isVendedor, isAdmin,
}: {
  usuario: { id: string; papel: string; lojaId: string | null }
  isVendedor: boolean
  isAdmin: boolean
}) {
  try {
    const lojaIds = isAdmin
      ? await listarLojaIdsDoGrupoAtivo(usuario)
      : (usuario.lojaId ? [usuario.lojaId] : [])
    // Vendedor vê só as próprias vendas; admin e aux_adm cobram o time inteiro.
    const dados = await pendenciasDeVendas({
      lojaIds,
      vendedorId: isVendedor ? usuario.id : undefined,
    })
    return <PendenciasDocumentosCard dados={dados} modo={isVendedor ? 'vendedor' : 'gestao'} />
  } catch (e) {
    console.error('[PendenciasDocumentosSection] erro:', e)
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
  filtros, filtrosRanking, podeVerTodosDescontos, vendedorAtualId,
}: {
  filtros: Filtros
  filtrosRanking: { dataInicio: string; dataFim: string; lojaId?: string[] }
  podeVerTodosDescontos: boolean
  vendedorAtualId?: string
}) {
  let rankingVendedores: Awaited<ReturnType<typeof getRankingVendedores>>,
      rankingLojas: Awaited<ReturnType<typeof getRankingLojas>>,
      modelosMaisVendidos: Awaited<ReturnType<typeof getModelosMaisVendidos>>,
      descontos: Awaited<ReturnType<typeof descontosPorVendedor>>
  try {
    ;[rankingVendedores, rankingLojas, modelosMaisVendidos, descontos] = await withTimeout(
      Promise.all([
        getRankingVendedores(filtrosRanking),
        getRankingLojas(filtrosRanking),
        getModelosMaisVendidos(filtros),
        // Quem não pode ver o desconto dos colegas recebe só a própria linha —
        // a query já filtra por vendedor, então o dado nem chega ao cliente.
        descontosPorVendedor({
          ...filtrosRanking,
          vendedorId: podeVerTodosDescontos ? undefined : (vendedorAtualId ? [vendedorAtualId] : []),
        }),
      ]),
      25000,
    )
  } catch (e) {
    console.error('[RankingSection] erro:', e)
    throw e
  }
  const descontosRanking = {
    porVendedor: new Map(descontos.map(d => [d.vendedorId, d])),
    periodoSemRegistro: periodoAnteriorAoRegistro(filtrosRanking.dataInicio),
  }
  return (
    <>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TabelaModelosMaisVendidos modelos={modelosMaisVendidos} />
        <TabelaRankingLojas ranking={rankingLojas} />
      </div>
      <TabelaRankingVendedores ranking={rankingVendedores} vendedorAtualId={vendedorAtualId} descontos={descontosRanking} />
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

// Meta de faturamento do mês, por loja da bandeira ativa, com projeção de
// fechamento no ritmo atual. Sempre o mês corrente, independente do filtro de
// período do dashboard: meta é do mês, não do intervalo que o usuário escolheu
// olhar. Sem meta cadastrada em /admin/metas, a seção inteira não aparece.
async function MetaSection({ usuario }: { usuario: { id: string; papel: string; lojaId: string | null } }) {
  const grupo = await getGrupoAtivo(usuario)
  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)
  if (lojaIds.length === 0) return null

  const { ano, mes, dia } = hojeEmBrasilia()
  const [linhas, hoje] = await Promise.all([
    linhasMetaDoMes(lojaIds, ano, mes),
    vendidoNoDia(lojaIds, ano, mes, dia),
  ])

  const meta = montarMetaDoMes({ linhas, ano, mes, dia })
  if (!meta) return null

  return <MetaMesCards meta={meta} grupoNome={grupo.nome} vendidoHoje={hoje} />
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']

// Atendimento (Kommo): cards de desempenho. Só lê o cache, não sincroniza.
// Vendedor vê os próprios números e a posição dele no ranking do grupo;
// admin/aux_adm veem o consolidado das lojas filtradas.
//
// A lista vermelha de leads críticos saiu do dashboard em 01/09/2026 (pedido do
// Cesar): com mais de mil leads na fila ela virou um banner permanente, que ocupava
// o topo da tela sem ninguém agir sobre ele. A contagem continua no card "Leads
// críticos" do painel, e o detalhe lead a lead vive em /atendimento.
async function AtendimentoSection({
  usuario, dataInicio, dataFim, usuarioId, lojaIdsFiltro,
}: {
  usuario: { id: string; papel: string; lojaId: string | null }
  dataInicio: string
  dataFim: string
  usuarioId?: string
  lojaIdsFiltro?: string[]
}) {
  const status = await getKommoStatus()
  if (!status.conectado) return null

  const lojaIds = lojaIdsFiltro ?? await listarLojaIdsDoGrupoAtivo(usuario)
  const inicio = new Date(dataInicio + 'T00:00:00')
  const fim = new Date(dataFim + 'T23:59:59')
  const painel = await painelAtendimento({ lojaIds, inicio, fim, deStr: dataInicio, ateStr: dataFim, usuarioId })
  if (!painel) return null

  return <PainelAtendimento cards={painel.cards} mes={MESES[inicio.getMonth()]} />
}

// Contas a pagar do mês. Materializa as ocorrências antes de ler (mesma função da
// tela do módulo), então uma conta recorrente aparece aqui sem ninguém precisar
// abrir /contas-pagar naquele mês. Fica no próprio Suspense porque a base
// automática da folha roda o cálculo inteiro dela.
async function ContasPagarSection() {
  const hoje = hojeBrt()
  const { doMes, atrasadas } = await listarContasDoMesAction(hoje.slice(0, 7))
  return <ContasPagarCard doMes={doMes} atrasadas={atrasadas} hoje={hoje} />
}

// Próximos eventos do calendário de gestão, respeitando a visibilidade de cada um.
async function ProximosEventosSection({ usuario }: { usuario: Awaited<ReturnType<typeof getUsuarioLogado>> }) {
  const eventos = await proximosEventos(usuario, 14)
  return <ProximosEventosCard eventos={eventos} />
}

function hojeISO() {
  return hojeBrt()
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

      {/* Antes dos eventos: é a primeira coisa que o Cesar quer ver ao abrir. */}
      {isAdmin && (
        <SectionErrorBoundary label="as contas a pagar">
          <Suspense fallback={null}>
            <ContasPagarSection />
          </Suspense>
        </SectionErrorBoundary>
      )}

      <SectionErrorBoundary label="os próximos eventos">
        <Suspense fallback={null}>
          <ProximosEventosSection usuario={usuario} />
        </Suspense>
      </SectionErrorBoundary>

      {(isAdmin || isAuxAdm) && (
        <SectionErrorBoundary label="os pedidos da fábrica">
          <Suspense fallback={null}>
            <PedidosFabricaSection usuario={usuario} />
          </Suspense>
        </SectionErrorBoundary>
      )}

      {isAuxAdm && usuario.lojaId && (
        <SectionErrorBoundary label="as pendências da loja">
          <Suspense fallback={null}>
            <PendenciasSection lojaId={usuario.lojaId} />
          </Suspense>
        </SectionErrorBoundary>
      )}

      {(isVendedor || isAdmin || isAuxAdm) && (
        <SectionErrorBoundary key={`atendimento-${filtroKey}`} label="o painel de atendimento">
          <Suspense fallback={null}>
            <AtendimentoSection
              usuario={usuario}
              dataInicio={dataInicio}
              dataFim={dataFim}
              // Vendedor vê os próprios leads; admin/aux_adm veem o grupo, ou um
              // vendedor específico quando filtram por ele (mesma regra dos KPIs).
              usuarioId={filtros.vendedorId}
              // Vendedor precisa das lojas do grupo inteiro pro ranking sair certo
              // (o filtro dele é só a própria loja); admin/aux_adm respeitam o
              // filtro de loja da página.
              lojaIdsFiltro={!isAdmin && isVendedor ? undefined : lojaIds}
            />
          </Suspense>
        </SectionErrorBoundary>
      )}

      {/* aux_adm entra junto: é quem cadastra a meta em /admin/metas e cobra a loja —
          não faz sentido preencher o alvo e não enxergar o placar. */}
      {(isAdmin || isAuxAdm) && (
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

      {(isVendedor || isAdmin || isAuxAdm) && (
        <SectionErrorBoundary label="as pendências de contrato e checklist">
          <Suspense fallback={null}>
            <PendenciasDocumentosSection usuario={usuario} isVendedor={isVendedor} isAdmin={isAdmin} />
          </Suspense>
        </SectionErrorBoundary>
      )}

      <SectionErrorBoundary key={`graficos-${filtroKey}`} label="os gráficos">
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <GraficosSection filtros={filtros} isAdmin={isAdmin} />
        </Suspense>
      </SectionErrorBoundary>

      <SectionErrorBoundary key={`ranking-${filtroKey}`} label="o ranking">
        <Suspense fallback={<SectionSkeleton rows={2} />}>
          <RankingSection
            filtros={filtros}
            filtrosRanking={filtrosRanking}
            podeVerTodosDescontos={isAdmin || isAuxAdm}
            vendedorAtualId={isVendedor ? usuario.id : undefined}
          />
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
