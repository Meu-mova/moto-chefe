import { Suspense } from 'react'
import { getUsuarioLogado } from '@/lib/auth'
import { listarAgendamentos } from '@/lib/queries/agendamentos'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { parseISO, startOfDay, endOfDay, startOfWeek, endOfWeek, addDays, format, isSameDay } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { AgendaNav } from './components/agenda-nav'
import { AgendaLojaSelect } from './components/agenda-loja-select'
import { AgendamentoCard } from './components/agendamento-card'
import { NovoAgendamentoDialog } from './components/novo-agendamento-dialog'
import { CalendarX } from 'lucide-react'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm']

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: Promise<{ data?: string; modo?: string; loja?: string }>
}) {
  const params  = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const podeGerenciar = GESTORES.includes(usuario.papel)

  const dataParam = params.data ? parseISO(params.data) : new Date()
  const modo      = (params.modo === 'semana' ? 'semana' : 'dia') as 'dia' | 'semana'

  const lojaIdsGrupo = isAdmin ? await listarLojaIdsDoGrupoAtivo(usuario) : (usuario.lojaId ? [usuario.lojaId] : [])
  const lojaParamValido = isAdmin && params.loja && lojaIdsGrupo.includes(params.loja) ? params.loja : null
  const lojaFiltroIds = lojaParamValido ? [lojaParamValido] : lojaIdsGrupo

  const dataInicio = modo === 'semana'
    ? startOfWeek(dataParam, { weekStartsOn: 1 })
    : startOfDay(dataParam)
  const dataFim = modo === 'semana'
    ? endOfWeek(dataParam, { weekStartsOn: 1 })
    : endOfDay(dataParam)

  const [lista, mecanicos, lojasOpts] = await Promise.all([
    listarAgendamentos({ lojaId: lojaFiltroIds, dataInicio, dataFim }),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(eq(usuarios.papel, 'mecanico')),
    isAdmin ? listarLojasDoGrupoAtivo(usuario) : Promise.resolve([]),
  ])

  // Contadores rápidos
  const pendentes   = lista.filter(a => a.status === 'pendente').length
  const confirmados = lista.filter(a => a.status === 'confirmado').length

  // Para modo semana: agrupa por dia
  const dias = modo === 'semana'
    ? Array.from({ length: 7 }, (_, i) => addDays(dataInicio, i))
    : [dataParam]

  return (
    <div className="space-y-5 max-w-4xl">
      {/* Cabeçalho */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Agenda da Oficina</h1>
          <p className="text-slate-500 text-sm">Agendamentos e ordens de serviço</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && lojasOpts.length > 0 && (
            <Suspense>
              <AgendaLojaSelect lojas={lojasOpts} lojaAtual={params.loja ?? ''} />
            </Suspense>
          )}
          {podeGerenciar && (
            <NovoAgendamentoDialog
              lojas={lojasOpts.length ? lojasOpts : []}
              mecanicos={mecanicos}
              papel={usuario.papel}
              lojaIdUsuario={usuario.lojaId ?? null}
            />
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-amber-600 uppercase tracking-wide">Pendentes</p>
          <p className="text-2xl font-bold text-amber-700 mt-0.5">{pendentes}</p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-blue-600 uppercase tracking-wide">Confirmados</p>
          <p className="text-2xl font-bold text-blue-700 mt-0.5">{confirmados}</p>
        </div>
        <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total no período</p>
          <p className="text-2xl font-bold text-slate-700 mt-0.5">{lista.length}</p>
        </div>
      </div>

      {/* Navegação */}
      <Suspense>
        <AgendaNav data={dataParam} modo={modo} />
      </Suspense>

      {/* Conteúdo */}
      {modo === 'dia' ? (
        <AgendaDia agendamentos={lista} podeGerenciar={podeGerenciar} />
      ) : (
        <AgendaSemana dias={dias} agendamentos={lista} podeGerenciar={podeGerenciar} />
      )}
    </div>
  )
}

function AgendaDia({ agendamentos, podeGerenciar }: {
  agendamentos: Awaited<ReturnType<typeof listarAgendamentos>>
  podeGerenciar: boolean
}) {
  if (agendamentos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-slate-400">
        <CalendarX size={40} strokeWidth={1.5} />
        <p className="text-sm">Nenhum agendamento neste dia.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {agendamentos.map(ag => (
        <AgendamentoCard key={ag.id} ag={ag} podeGerenciar={podeGerenciar} />
      ))}
    </div>
  )
}

function AgendaSemana({ dias, agendamentos, podeGerenciar }: {
  dias: Date[]
  agendamentos: Awaited<ReturnType<typeof listarAgendamentos>>
  podeGerenciar: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {dias.map(dia => {
        const dodia = agendamentos.filter(a => isSameDay(new Date(a.dataHoraInicio), dia))
        const labelDia = format(dia, "EEEE, dd/MM", { locale: ptBR })
        return (
          <div key={dia.toISOString()}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-slate-700 capitalize">{labelDia}</h3>
              {dodia.length > 0 && (
                <span className="text-xs bg-slate-200 text-slate-600 rounded-full px-1.5 py-0.5 font-medium">
                  {dodia.length}
                </span>
              )}
            </div>
            {dodia.length === 0
              ? <p className="text-xs text-slate-400 pl-2 py-2">Sem agendamentos</p>
              : <div className="space-y-2 pl-2 border-l-2 border-slate-100">
                  {dodia.map(ag => <AgendamentoCard key={ag.id} ag={ag} podeGerenciar={podeGerenciar} />)}
                </div>
            }
          </div>
        )
      })}
    </div>
  )
}

