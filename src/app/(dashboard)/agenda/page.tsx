import { redirect } from 'next/navigation'
import { Suspense } from 'react'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { listarAgendamentos } from '@/lib/queries/agendamentos'
import { getGrupoAtivo, listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { listarUsuariosDoGrupo } from '@/lib/usuarios-do-grupo'
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
  if (!usuarioPodeAcessar(usuario, '/agenda')) redirect('/dashboard')
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

  const grupo = await getGrupoAtivo(usuario)
  const [lista, mecanicos, lojasOpts] = await Promise.all([
    listarAgendamentos({ lojaId: lojaFiltroIds, dataInicio, dataFim }),
    listarUsuariosDoGrupo(grupo.id, { papeis: ['mecanico'] }),
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
          <p className="text-muted-foreground text-sm">Agendamentos e ordens de serviço</p>
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
        <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-warning uppercase tracking-wide">Pendentes</p>
          <p className="text-2xl font-bold text-warning mt-0.5">{pendentes}</p>
        </div>
        <div className="bg-info/10 border border-info/30 rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-info uppercase tracking-wide">Confirmados</p>
          <p className="text-2xl font-bold text-info mt-0.5">{confirmados}</p>
        </div>
        <div className="bg-muted border border-border rounded-lg px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Total no período</p>
          <p className="text-2xl font-bold text-foreground mt-0.5">{lista.length}</p>
        </div>
      </div>

      {/* Navegação */}
      <Suspense>
        <AgendaNav data={dataParam} modo={modo} />
      </Suspense>

      {/* Conteúdo */}
      {modo === 'dia' ? (
        <AgendaDia agendamentos={lista} podeGerenciar={podeGerenciar} mecanicos={mecanicos} />
      ) : (
        <AgendaSemana dias={dias} agendamentos={lista} podeGerenciar={podeGerenciar} mecanicos={mecanicos} />
      )}
    </div>
  )
}

function AgendaDia({ agendamentos, podeGerenciar, mecanicos }: {
  agendamentos: Awaited<ReturnType<typeof listarAgendamentos>>
  podeGerenciar: boolean
  mecanicos: { id: string; nome: string }[]
}) {
  if (agendamentos.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-muted-foreground">
        <CalendarX size={40} strokeWidth={1.5} />
        <p className="text-sm">Nenhum agendamento neste dia.</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {agendamentos.map(ag => (
        <AgendamentoCard key={ag.id} ag={ag} podeGerenciar={podeGerenciar} mecanicos={mecanicos} />
      ))}
    </div>
  )
}

function AgendaSemana({ dias, agendamentos, podeGerenciar, mecanicos }: {
  dias: Date[]
  agendamentos: Awaited<ReturnType<typeof listarAgendamentos>>
  podeGerenciar: boolean
  mecanicos: { id: string; nome: string }[]
}) {
  return (
    <div className="grid grid-cols-1 gap-4">
      {dias.map(dia => {
        const dodia = agendamentos.filter(a => isSameDay(new Date(a.dataHoraInicio), dia))
        const labelDia = format(dia, "EEEE, dd/MM", { locale: ptBR })
        return (
          <div key={dia.toISOString()}>
            <div className="flex items-center gap-2 mb-2">
              <h3 className="text-sm font-semibold text-foreground capitalize">{labelDia}</h3>
              {dodia.length > 0 && (
                <span className="text-xs bg-muted text-muted-foreground rounded-full px-1.5 py-0.5 font-medium">
                  {dodia.length}
                </span>
              )}
            </div>
            {dodia.length === 0
              ? <p className="text-xs text-muted-foreground pl-2 py-2">Sem agendamentos</p>
              : <div className="space-y-2 pl-2 border-l-2 border-border">
                  {dodia.map(ag => <AgendamentoCard key={ag.id} ag={ag} podeGerenciar={podeGerenciar} mecanicos={mecanicos} />)}
                </div>
            }
          </div>
        )
      })}
    </div>
  )
}

