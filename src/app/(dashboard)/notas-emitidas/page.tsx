import Link from 'next/link'
import { redirect } from 'next/navigation'
import { FileText } from 'lucide-react'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { listarNotasEmitidas, type NotaEmitida } from '@/lib/queries/notas-emitidas'
import type { CategoriaNota } from '@/lib/notas-emitidas'
import { Card, CardContent } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Filtro = CategoriaNota | 'ativas' | 'todas'

// "ativas" é o padrão: a Descartada nunca virou nota, só aparece em "Todas".
const FILTROS: { valor: Filtro; texto: string }[] = [
  { valor: 'ativas', texto: 'Emitidas' },
  { valor: 'autorizada', texto: 'Autorizadas' },
  { valor: 'cancelada', texto: 'Canceladas' },
  { valor: 'recusada', texto: 'Recusadas' },
  { valor: 'em_andamento', texto: 'Em andamento' },
  { valor: 'todas', texto: 'Todas' },
]

const STATUS: Record<CategoriaNota, { texto: string; cor: string }> = {
  autorizada:   { texto: 'Autorizada', cor: 'bg-primary-soft text-primary-text' },
  cancelada:    { texto: 'Cancelada', cor: 'bg-muted text-muted-foreground' },
  recusada:     { texto: 'Recusada', cor: 'bg-destructive/10 text-destructive' },
  em_andamento: { texto: 'Em andamento', cor: 'bg-warning/10 text-warning' },
  descartada:   { texto: 'Descartada', cor: 'bg-muted text-muted-foreground' },
}

function noFiltro(n: NotaEmitida, filtro: Filtro) {
  if (filtro === 'todas') return true
  if (filtro === 'ativas') return n.categoria !== 'descartada'
  return n.categoria === filtro
}

const dataHora = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })

function StatusNota({ n }: { n: NotaEmitida }) {
  const s = STATUS[n.categoria]
  return <Badge className={s.cor} title={n.status}>{s.texto}</Badge>
}

function Arquivos({ n }: { n: NotaEmitida }) {
  if (!n.linkDanfe && !n.linkXml) return <span className="text-muted-foreground">—</span>
  return (
    <span className="flex gap-3">
      {n.linkDanfe && <a href={n.linkDanfe} target="_blank" rel="noopener noreferrer" className="text-primary-text underline-offset-4 hover:underline">DANFE</a>}
      {n.linkXml && <a href={n.linkXml} target="_blank" rel="noopener noreferrer" className="text-primary-text underline-offset-4 hover:underline">XML</a>}
    </span>
  )
}

const venda = (n: NotaEmitida) => (n.vendaNumero == null ? '—' : `Venda #${n.vendaNumero}`)

export default async function NotasEmitidasPage({
  searchParams,
}: { searchParams: Promise<{ status?: string; ambiente?: string }> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/notas-emitidas')) redirect('/dashboard')

  const params = await searchParams
  const filtro: Filtro = FILTROS.some(f => f.valor === params.status) ? (params.status as Filtro) : 'ativas'
  const ambiente = params.ambiente === 'Homologacao' ? 'Homologacao' : 'Producao'
  const grupo = await grupoAtivoDaRequisicao(usuario)

  const notas = await listarNotasEmitidas({
    grupoId: grupo.id,
    contaId: usuario.papel === 'admin_geral' ? null : grupo.contaId,
    ambiente,
  })
  const visiveis = notas.filter(n => noFiltro(n, filtro))
  const href = (mudanca: { status?: Filtro; ambiente?: string }) =>
    `/notas-emitidas?${new URLSearchParams({ status: mudanca.status ?? filtro, ambiente: mudanca.ambiente ?? ambiente })}`

  return (
    <div className="space-y-4">
      <div>
        <h1 className="flex items-center gap-2 text-xl font-semibold"><FileText className="size-5" /> Notas Emitidas</h1>
        <p className="text-sm text-muted-foreground">NF-e de saída do grupo {grupo.nome}</p>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <nav aria-label="Filtrar por status" className="flex flex-wrap gap-1.5">
          {FILTROS.map(f => (
            <Link
              key={f.valor}
              href={href({ status: f.valor })}
              aria-current={f.valor === filtro ? 'page' : undefined}
              className={cn(
                'rounded-full border px-3 py-1 text-sm',
                f.valor === filtro ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-card hover:bg-muted',
              )}
            >
              {f.texto} <span className="opacity-75">{notas.filter(n => noFiltro(n, f.valor)).length}</span>
            </Link>
          ))}
        </nav>
        <nav aria-label="Ambiente" className="flex gap-1.5 text-sm">
          {(['Producao', 'Homologacao'] as const).map(a => (
            <Link
              key={a}
              href={href({ ambiente: a })}
              aria-current={a === ambiente ? 'page' : undefined}
              className={cn('rounded-md border px-2 py-1', a === ambiente ? 'border-primary text-primary-text' : 'border-input text-muted-foreground')}
            >
              {a === 'Producao' ? 'Produção' : 'Homologação'}
            </Link>
          ))}
        </nav>
      </div>

      {ambiente === 'Homologacao' && (
        <p className="text-sm text-warning">Homologação: notas de teste, sem valor fiscal.</p>
      )}

      {visiveis.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Nenhuma nota neste filtro.</CardContent></Card>
      ) : (
        <>
          <ul className="space-y-2 lg:hidden">
            {visiveis.map(n => (
              <li key={n.id}>
                <Card>
                  <CardContent className="space-y-1 py-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-semibold">NF {n.numero ?? '—'} · série {n.serie ?? '—'}</span>
                      <StatusNota n={n} />
                    </div>
                    <p className="text-sm text-muted-foreground">{dataHora(n.criadoEm)} · {venda(n)}{n.clienteNome ? ` · ${n.clienteNome}` : ''}</p>
                    {n.motivoStatus && <p className="text-sm text-muted-foreground">{n.motivoStatus}</p>}
                    <div className="text-sm"><Arquivos n={n} /></div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>

          <Card className="hidden lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nota</TableHead>
                  <TableHead>Data</TableHead>
                  <TableHead>Venda / Cliente</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Arquivos</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visiveis.map(n => (
                  <TableRow key={n.id}>
                    <TableCell><span className="font-semibold">{n.numero ?? '—'}</span> <span className="text-muted-foreground">série {n.serie ?? '—'}</span></TableCell>
                    <TableCell className="whitespace-nowrap">{dataHora(n.criadoEm)}</TableCell>
                    <TableCell>{venda(n)}{n.clienteNome && <span className="text-muted-foreground"> · {n.clienteNome}</span>}</TableCell>
                    <TableCell><StatusNota n={n} /></TableCell>
                    <TableCell className="max-w-xs whitespace-normal text-muted-foreground">{n.motivoStatus ?? '—'}</TableCell>
                    <TableCell><Arquivos n={n} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Card>
        </>
      )}
    </div>
  )
}
