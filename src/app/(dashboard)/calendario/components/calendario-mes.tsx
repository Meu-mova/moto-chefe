'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format,
} from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { ChevronLeft, ChevronRight, Plus, Pencil, Trash2, Clock, Repeat, Eye, MapPin, User, CalendarRange } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { corMeta, diasDoSpan, VISIBILIDADE_META, RECORRENCIA_META } from '@/lib/calendario'
import type { OcorrenciaCalendario } from '@/lib/queries/calendario'
import { EventoDialog } from './evento-dialog'
import { excluirEventoAction } from '../actions'

type Categoria = { id: string; nome: string; cor: string }

type Props = {
  mes: string
  ocorrencias: OcorrenciaCalendario[]
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

export function CalendarioMes({ mes, ocorrencias, usuarioId, isAdmin, categorias, lojas, usuariosGrupo, lojaIdUsuario }: Props) {
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

      <div className="bg-white border rounded-lg overflow-hidden">
        <div className="grid grid-cols-7 border-b bg-slate-50">
          {DIAS_SEMANA.map(d => (
            <div key={d} className="px-2 py-1.5 text-center text-xs font-medium text-slate-500 capitalize">{d}</div>
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
                className={`min-h-[92px] border-b border-r p-1.5 cursor-pointer hover:bg-slate-50/70 ${noMes ? '' : 'bg-slate-50/40'}`}
              >
                <div className={`text-xs mb-1 inline-flex items-center justify-center h-5 w-5 rounded-full ${
                  ehHoje ? 'bg-slate-900 text-white font-semibold' : noMes ? 'text-slate-600' : 'text-slate-300'
                }`}>
                  {dia.getDate()}
                </div>
                <div className="space-y-1">
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
                    <button onClick={e => { e.stopPropagation(); setDetalhe(doDia[3]) }} className="text-[11px] text-slate-400 px-1.5">
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
                  <p className="text-slate-500">{detalhe.categoriaNome}</p>
                  <p className="flex items-center gap-2">
                    <Clock size={14} className="text-slate-400" />
                    {multi
                      ? <span>{fmtData(detalhe.inicio)} — {fmtData(detalhe.fim)}</span>
                      : <span>{format(new Date(`${detalhe.inicio}T12:00:00Z`), "EEEE, dd 'de' MMMM 'de' yyyy", { locale: ptBR })}</span>}
                    {detalhe.hora && <span className="tabular-nums">· {detalhe.hora}</span>}
                  </p>
                  {detalhe.recorrencia !== 'nenhuma' && (
                    <p className="flex items-center gap-2 text-slate-500"><Repeat size={14} className="text-slate-400" />{RECORRENCIA_META[detalhe.recorrencia as keyof typeof RECORRENCIA_META]}</p>
                  )}
                  <p className="flex items-center gap-2 text-slate-500">
                    <Eye size={14} className="text-slate-400" />
                    {VISIBILIDADE_META[detalhe.visibilidade as keyof typeof VISIBILIDADE_META]?.label ?? detalhe.visibilidade}
                    {detalhe.visibilidade === 'loja' && detalhe.lojaNome && <span className="inline-flex items-center gap-1"><MapPin size={12} />{detalhe.lojaNome}</span>}
                  </p>
                  {detalhe.criadoPorNome && (
                    <p className="flex items-center gap-2 text-slate-500"><User size={14} className="text-slate-400" />Criado por {detalhe.criadoPorNome}</p>
                  )}
                  {detalhe.descricao && (
                    <p className="bg-slate-50 border rounded px-2.5 py-2 text-slate-700 whitespace-pre-wrap">{detalhe.descricao}</p>
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
