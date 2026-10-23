import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { listarNotasEmitidas, type NotaEmitida } from '@/lib/queries/notas-emitidas'
import { linkDaVenda, periodoEmissao, type CategoriaNota } from '@/lib/notas-emitidas'
import { Badge } from '@/components/ui/badge'
import { Secao, TabelaPainel, type Coluna } from '../dashboard/components/painel-secoes'
import { NotasFiltros } from './components/notas-filtros'

type Filtro = CategoriaNota | 'ativas' | 'todas'

const STATUS: Record<CategoriaNota, { texto: string; cor: string }> = {
  autorizada:   { texto: 'Autorizada', cor: 'bg-primary-soft text-primary-text' },
  cancelada:    { texto: 'Cancelada', cor: 'bg-muted text-muted-foreground' },
  recusada:     { texto: 'Recusada', cor: 'bg-destructive/10 text-destructive' },
  em_andamento: { texto: 'Em andamento', cor: 'bg-warning/10 text-warning' },
  descartada:   { texto: 'Descartada', cor: 'bg-muted text-muted-foreground' },
}

// Os indicadores do topo filtram a tabela. Cor só no número, e só quando há algo a fazer (como no dashboard).
const INDICADORES: { categoria: CategoriaNota; rotulo: string; alerta?: string; dica?: string }[] = [
  { categoria: 'autorizada', rotulo: 'Autorizadas' },
  { categoria: 'cancelada', rotulo: 'Canceladas' },
  { categoria: 'recusada', rotulo: 'Recusadas', alerta: 'text-destructive', dica: 'a corrigir e reenviar' },
  { categoria: 'em_andamento', rotulo: 'Em andamento', alerta: 'text-warning' },
]

const TITULO: Record<Filtro, string> = {
  ativas: 'Emitidas', todas: 'Todas as tentativas', autorizada: 'Autorizadas', cancelada: 'Canceladas',
  recusada: 'Recusadas', em_andamento: 'Em andamento', descartada: 'Descartadas',
}

// "ativas" é o padrão: a Descartada nunca virou nota, só aparece em "Todas".
function noFiltro(n: NotaEmitida, filtro: Filtro) {
  if (filtro === 'todas') return true
  if (filtro === 'ativas') return n.categoria !== 'descartada'
  return n.categoria === filtro
}

const data = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
const link = 'text-primary-text underline-offset-4 hover:underline'

function Venda({ n }: { n: NotaEmitida }) {
  if (n.vendaNumero == null) return <span className="text-muted-foreground">—</span>
  const href = linkDaVenda(n)
  return href ? <Link href={href} className={link}>#{n.vendaNumero}</Link> : <>#{n.vendaNumero}</>
}

function Arquivos({ n }: { n: NotaEmitida }) {
  if (!n.linkDanfe && !n.linkXml) return <span className="text-muted-foreground">—</span>
  return (
    <span className="inline-flex gap-2">
      {n.linkDanfe && <a href={n.linkDanfe} target="_blank" rel="noopener noreferrer" className={link}>DANFE</a>}
      {n.linkXml && <a href={n.linkXml} target="_blank" rel="noopener noreferrer" className={link}>XML</a>}
    </span>
  )
}

const COLUNAS: Coluna<NotaEmitida>[] = [
  { titulo: 'Nota', valor: n => <span className="font-semibold text-foreground">{n.numero ?? '—'}</span>, principal: true },
  { titulo: 'Série', valor: n => <span className="text-muted-foreground">{n.serie ?? '—'}</span>, secundaria: true },
  { titulo: 'Venda', valor: n => <Venda n={n} /> },
  { titulo: 'Cliente', valor: n => n.clienteNome ?? <span className="text-muted-foreground">—</span>, secundaria: true },
  { titulo: 'Status', valor: n => <Badge className={STATUS[n.categoria].cor} title={n.status}>{STATUS[n.categoria].texto}</Badge> },
  { titulo: 'Motivo', valor: n => <span className="text-muted-foreground">{n.motivoStatus ?? '—'}</span>, secundaria: true, classe: 'max-w-xs whitespace-normal' },
  { titulo: 'Data', valor: n => <span className="text-muted-foreground">{data(n.criadoEm)}</span>, direita: true },
  { titulo: 'Arquivos', valor: n => <Arquivos n={n} />, direita: true },
]

export default async function NotasEmitidasPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; ambiente?: string; de?: string; ate?: string }> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/notas-emitidas')) redirect('/dashboard')

  const params = await searchParams
  const filtro: Filtro = params.status && params.status in TITULO ? (params.status as Filtro) : 'ativas'
  const ambiente = params.ambiente === 'Homologacao' ? 'Homologacao' : 'Producao'
  const periodo = periodoEmissao(params)
  const grupo = await grupoAtivoDaRequisicao(usuario)

  const notas = await listarNotasEmitidas({
    grupoId: grupo.id,
    contaId: usuario.papel === 'admin_geral' ? null : grupo.contaId,
    ambiente,
    ...periodo,
  })
  const visiveis = notas.filter(n => noFiltro(n, filtro))
  const href = (status: Filtro) => `/notas-emitidas?${new URLSearchParams({ status, ambiente, ...periodo })}`

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between lg:gap-4">
        <div>
          <h1 className="text-2xl font-bold">Notas Emitidas</h1>
          <p className="text-sm text-muted-foreground">NF-e de saída do grupo {grupo.nome}</p>
        </div>
        <NotasFiltros de={periodo.de} ate={periodo.ate} ambiente={ambiente} />
      </div>

      {ambiente === 'Homologacao' && (
        <p className="text-sm text-warning">Homologação: notas de teste, sem valor fiscal.</p>
      )}

      <nav aria-label="Filtrar por status" className="grid overflow-hidden rounded-md border border-t-[3px] border-border border-t-primary bg-card sm:grid-cols-4">
        {INDICADORES.map(i => {
          const ativo = filtro === i.categoria
          const total = notas.filter(n => n.categoria === i.categoria).length
          return (
            // Clicar no indicador ativo volta para "Emitidas".
            <Link key={i.categoria} href={href(ativo ? 'ativas' : i.categoria)} aria-current={ativo ? 'page' : undefined}
              className={`flex items-center justify-between border-b border-border px-4 py-3 last:border-b-0 sm:block sm:border-b-0 sm:border-r sm:px-5 sm:py-4 sm:last:border-r-0 ${ativo ? 'bg-primary-soft shadow-[inset_0_-3px_0_var(--primary)]' : 'hover:bg-muted'}`}>
              <span className="block">
                <span className="block text-xs font-medium text-muted-foreground">{i.rotulo}</span>
                {i.dica && <span className="block text-xs text-muted-foreground sm:order-last">{i.dica}</span>}
              </span>
              <span className={`mt-0.5 block text-2xl font-bold tracking-tight tabular-nums sm:text-3xl ${total > 0 && i.alerta ? i.alerta : 'text-foreground'}`}>{total}</span>
            </Link>
          )
        })}
      </nav>

      <Secao
        titulo={TITULO[filtro]}
        acao={
          <span className="text-sm text-muted-foreground">
            {visiveis.length} {visiveis.length === 1 ? 'nota' : 'notas'}
            {filtro !== 'todas' && <> · <Link href={href('todas')} className={link}>ver todas</Link></>}
          </span>
        }
      >
        <TabelaPainel rotulo={TITULO[filtro]} linhas={visiveis} colunas={COLUNAS} chave={n => n.id} vazio="Nenhuma nota neste filtro."
          detalhe={n => <>série {n.serie ?? '—'}{n.clienteNome && ` · ${n.clienteNome}`}{n.motivoStatus && ` · ${n.motivoStatus}`}</>} />
      </Secao>
    </div>
  )
}
