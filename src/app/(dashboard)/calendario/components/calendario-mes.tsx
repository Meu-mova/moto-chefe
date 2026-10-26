'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Clock, Repeat, Eye, MapPin, User, CalendarRange, Wallet, Check } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { corMeta, diasDoSpan, VISIBILIDADE_META, RECORRENCIA_META } from '@/lib/calendario'
import type { OcorrenciaCalendario } from '@/lib/queries/calendario'
import { EventoDialog } from './evento-dialog'
import { excluirEventoAction } from '../actions'
import { marcarPagoAction, type ContaNoCalendario } from '../../contas-pagar/actions'

type Categoria = { id: string; nome: string; cor: string }

type Props = {
  mes: string
  ocorrencias: OcorrenciaCalendario[]
  /** Contas a pagar que vencem no mês. Vazio para quem não tem o módulo. */
  contas: ContaNoCalendario[]
  /** 'YYYY-MM-DD' do servidor — "vencida" tem que sair do calendário de Brasília. */
  hoje: string
  usuarioId: string
  isAdmin: boolean
  categorias: Categoria[]
  lojas: { id: string; nome: string }[]
  usuariosGrupo: { id: string; nome: string }[]
  lojaIdUsuario: string | null
}

const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']

function mesVizinho(mes: string, delta: number): string {
  const [y, m] = mes.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}
function fmtData(yyyyMmDd: string) {
  return format(new Date(`${yyyyMmDd}T12:00:00Z`), "dd/MM/yyyy", { locale: ptBR })
}

/**
 * Chip de conta a pagar dentro do dia.
 *
 * Clicar marca como paga ali mesmo — o módulo nasceu porque o compromisso some de
 * vista quando a data passa, e obrigar a abrir outra tela para dar baixa manteria
 * metade do problema.
 */
function ChipConta({ conta, hoje }: { conta: ContaNoCalendario; hoje: string }) {
  const [pending, start] = useTransition()
  const router = useRouter()
  const vencida = !conta.pago && conta.vencimento.slice(0, 10) < hoje

  const cls = conta.pago
    ? 'border-success/30 bg-success/10 text-success line-through'
    : vencida
      ? 'border-destructive/50 bg-destructive/10 text-destructive font-medium'
      : 'border-warning/30 bg-warning/10 text-warning'

  function alternar(e: React.MouseEvent) {
    e.stopPropagation()
    start(async () => {
      try {
        await marcarPagoAction(conta.id, !conta.pago)
        toast.success(conta.pago ? 'Marcada como em aberto' : 'Conta marcada como paga')
        router.refresh()
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : 'Erro ao marcar')
      }
    })
  }

  return (
    <button
      onClick={alternar}
      disabled={pending}
      title={`${conta.descricao} — ${Number(conta.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}${conta.pago ? ' (paga)' : vencida ? ' (vencida)' : ''}\nClique para ${conta.pago ? 'desmarcar' : 'marcar como paga'}`}
      className={`w-full truncate rounded border px-1.5 py-0.5 text-left text-[11px] ${cls} disabled:opacity-50`}
    >
      {conta.pago ? <Check size={9} className="mr-1 -mt-0.5 inline" /> : <Wallet size={9} className="mr-1 -mt-0.5 inline" />}
      {conta.descricao}
    </button>
  )
}

export function CalendarioMes({ mes, ocorrencias, usuarioId, isAdmin, categorias, lojas, usuariosGrupo, lojaIdUsuario, contas, hoje }: Props) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [novoOpen, setNovoOpen] = useState(false)
  const [novoData, setNovoData] = useState<string>('')
  const [detalhe, setDetalhe] = useState<OcorrenciaCalendario | null>(null)
  const [editarOpen, setEditarOpen] = useState(false)

  const [y, m] = mes.split('-').map(Number)
  const primeiro = new Date(y, m - 1, 1)
  const mesInicio = `${mes}-01`
  const mesFim = `${mes}-${String(new Date(y, m, 0).getDate()).padStart(2, '0')}`
  const dias = eachDayOfInterval({
    start: startOfWeek(startOfMonth(primeiro), { weekStartsOn: 1 }),
    end:   endOfWeek(endOfMonth(primeiro), { weekStartsOn: 1 }),
  })
  const hojeStr = format(new Date(), 'yyyy-MM-dd')

  // Um evento de vários dias aparece em cada dia que cobre dentro do mês.
  const porDia = new Map<string, OcorrenciaCalendario[]>()
  for (const o of ocorrencias) {
    for (const dia of diasDoSpan({ inicio: o.inicio, fim: o.fim }, mesInicio, mesFim)) {
      if (!porDia.has(dia)) porDia.set(dia, [])
      porDia.get(dia)!.push(o)
    }
  }

  // Uma conta vence num dia só, então basta agrupar pela data de vencimento.
  const contasPorDia = new Map<string, ContaNoCalendario[]>()
  for (const c of contas) {
    const dia = c.vencimento.slice(0, 10)
    if (!contasPorDia.has(dia)) contasPorDia.set(dia, [])
    contasPorDia.get(dia)!.push(c)
  }

  const podeEditar = (o: OcorrenciaCalendario) => isAdmin || o.criadoPor === usuarioId
  const tituloMes = format(primeiro, "MMMM 'de' yyyy", { locale: ptBR })

  function abrirNovo(data: string) { setNovoData(data); setNovoOpen(true) }

  function excluir(o: OcorrenciaCalendario) {
    if (!confirm(`Excluir "${o.titulo}"?${o.recorrencia !== 'nenhuma' ? ' Isso remove todas as repetições.' : ''}`)) return
    start(async () => {
      try {
        await excluirEventoAction(o.id)
        toast.success('Evento excluído')
        setDetalhe(null)
        router.refresh()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
      }
    })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link href={`/calendario?mes=${mesVizinho(mes, -1)}`} aria-label="Mês anterior"
            className={buttonVariants({ variant: 'outline', size: 'icon', className: 'h-8 w-8' })}>
            <ChevronLeft size={16} />
          </Link>
          <Link href={`/calendario?mes=${mesVizinho(mes, 1)}`} aria-label="Próximo mês"
            className={buttonVariants({ variant: 'outline', size: 'icon', className: 'h-8 w-8' })}>
            <ChevronRight size={16} />
          </Link>
          <h2 className="text-lg font-semibold capitalize ml-2">{tituloMes}</h2>
        </div>
        <Button size="sm" className="gap-1.5" onClick={() => abrirNovo(hojeStr.startsWith(mes) ? hojeStr : mesInicio)}>
          <Plus size={15} /> Novo evento
        </Button>
      </div>

      <div className="bg-card border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-muted">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="px-2 py-1.5 text-center text-xs font-medium text-muted-foreground capitalize">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {dias.map(dia => {
            const key = format(dia, 'yyyy-MM-dd')
            const doDia = porDia.get(key) ?? []
            const noMes = dia.getMonth() === m - 1
            const ehHoje = key === hojeStr
            return (
              <div
                key={key}
                onClick={() => abrirNovo(key)}
                className={`min-h-[92px] border-b border-r p-1.5 cursor-pointer hover:bg-muted/70 ${noMes ? '' : 'bg-muted/40'}`}
              >
                <div className={`text-xs mb-1 inline-flex items-center justify-center h-5 w-5 rounded-full ${
                  ehHoje ? 'bg-primary text-primary-foreground font-semibold' : noMes ? 'text-foreground' : 'text-muted-foreground'
                }`}>
                  {dia.getDate()}
                </div>
                <div className="space-y-1">
                  {/* Contas antes dos eventos: é o compromisso que não pode passar
                      batido. Um clique marca como paga sem sair do calendário. */}
                  {(contasPorDia.get(key) ?? []).map(c => (
                    <ChipConta key={c.id} conta={c} hoje={hoje} />
                  ))}
                  {doDia.slice(0, 3).map((o, i) => {
                    const meta = corMeta(o.cor)
                    const multi = o.inicio !== o.fim
                    return (
                      <button
                        key={`${o.id}-${i}`}
                        onClick={e => { e.stopPropagation(); setDetalhe(o) }}
                        className={`w-full text-left truncate text-[11px] px-1.5 py-0.5 rounded border ${meta.chip}`}
                        title={o.titulo}
                      >
                        {multi && <CalendarRange size={9} className="inline mr-1 -mt-0.5" />}
                        {o.hora && !multi && <span className="tabular-nums mr-1">{o.hora}</span>}{o.titulo}
                      </button>
                    )
                  })}
                  {doDia.length > 3 && (
                    <button onClick={e => { e.stopPropagation(); setDetalhe(doDia[3]) }} className="text-[11px] text-muted-foreground px-1.5">
                      +{doDia.length - 3} mais
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {novoOpen && (
        <EventoDialog
          open={novoOpen} onOpenChange={setNovoOpen} modo="criar"
          dataInicial={novoData} categorias={categorias} lojas={lojas} usuariosGrupo={usuariosGrupo} lojaIdUsuario={lojaIdUsuario}
        />
      )}

      {editarOpen && detalhe && (
        <EventoDialog
          open={editarOpen} onOpenChange={o => { setEditarOpen(o); if (!o) setDetalhe(null) }} modo="editar"
          evento={detalhe} categorias={categorias} lojas={lojas} usuariosGrupo={usuariosGrupo} lojaIdUsuario={lojaIdUsuario}
        />
      )}

      <Dialog open={!!detalhe && !editarOpen} onOpenChange={o => !o && setDetalhe(null)}>
        <DialogContent className="sm:max-w-md">
          {detalhe && (() => {
            const meta = corMeta(detalhe.cor)
            const multi = detalhe.inicio !== detalhe.fim
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${meta.dot}`} />
                    {detalhe.titulo}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-2.5 text-sm py-1">
                  <p className="text-muted-foreground">{detalhe.categoriaNome}</p>
                  <p className="flex items-center gap-2">
                    <Clock size={14} className="text-muted-foreground" />
                    {multi
                      ? <span>{fmtData(detalhe.inicio)} — {fmtData(detalhe.fim)}</span>
                      : <span>{format(new Date(`${detalhe.inicio}T12:00:00Z`), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>}
                    {detalhe.hora && <span className="tabular-nums">· {detalhe.hora}</span>}
                  </p>
                  {detalhe.recorrencia !== 'nenhuma' && (
                    <p className="flex items-center gap-2 text-muted-foreground"><Repeat size={14} className="text-muted-foreground" />{RECORRENCIA_META[detalhe.recorrencia as keyof typeof RECORRENCIA_META]}</p>
                  )}
                  <p className="flex items-center gap-2 text-muted-foreground">
                    <Eye size={14} className="text-muted-foreground" />
                    {VISIBILIDADE_META[detalhe.visibilidade as keyof typeof VISIBILIDADE_META]?.label ?? detalhe.visibilidade}
                    {detalhe.visibilidade === 'loja' && detalhe.lojaNome && <span className="inline-flex items-center gap-1"><MapPin size={12} />{detalhe.lojaNome}</span>}
                  </p>
                  {detalhe.criadoPorNome && (
                    <p className="flex items-center gap-2 text-muted-foreground"><User size={14} className="text-muted-foreground" />Criado por {detalhe.criadoPorNome}</p>
                  )}
                  {detalhe.descricao && (
                    <p className="bg-muted border rounded px-2.5 py-2 text-foreground whitespace-pre-wrap">{detalhe.descricao}</p>
                  )}
                </div>
                {podeEditar(detalhe) && (
                  <DialogFooter>
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setEditarOpen(true)} disabled={pending}>
                      <Pencil size={14} /> Editar
                    </Button>
                    <Button variant="destructive" size="sm" className="gap-1.5" onClick={() => excluir(detalhe)} disabled={pending}>
                      <Trash2 size={14} /> Excluir
                    </Button>
                  </DialogFooter>
                )}
              </>
            )
          })()}
        </DialogContent>
      </Dialog>
    </div>
  )
}
