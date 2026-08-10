import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'
import type { LeadCritico, MotivoCritico } from '@/lib/queries/atendimento'

type Dados = {
  leads: LeadCritico[]
  total: number
  semResposta: number
  tarefaAtrasada: number
  paradoSemTarefa: number
  valorEmRisco: number
}

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const MOTIVO: Record<MotivoCritico, { rotulo: string; badge: string; texto: (d: number) => string }> = {
  sem_resposta: {
    rotulo: 'SEM RESPOSTA',
    badge: 'bg-red-600 text-white',
    texto: d => `cliente esperando há ${d} dia(s)`,
  },
  tarefa_atrasada: {
    rotulo: 'TAREFA ATRASADA',
    badge: 'bg-amber-500 text-white',
    texto: d => `venceu há ${d} dia(s)`,
  },
  parado_sem_tarefa: {
    rotulo: 'SEM PRÓXIMO PASSO',
    badge: 'bg-slate-600 text-white',
    texto: d => `parado há ${d} dia(s), sem tarefa agendada`,
  },
}

export function LeadsCriticos({
  dados, subdominio, mostrarColaborador = false,
}: { dados: Dados; subdominio: string | null; mostrarColaborador?: boolean }) {
  if (dados.total === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
        <CheckCircle2 size={16} className="shrink-0" />
        <span>Nenhum lead crítico agora: todo cliente foi respondido e as tarefas estão em dia.</span>
      </div>
    )
  }

  const ocultos = dados.total - dados.leads.length
  const resumo = [
    dados.semResposta > 0 ? `${dados.semResposta} sem resposta` : null,
    dados.tarefaAtrasada > 0 ? `${dados.tarefaAtrasada} com tarefa atrasada` : null,
    dados.paradoSemTarefa > 0 ? `${dados.paradoSemTarefa} sem próximo passo` : null,
  ].filter(Boolean).join(' · ')

  return (
    <div className="rounded-xl border-2 border-red-500 bg-red-50 p-5 shadow-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle size={26} className="text-red-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-red-700 leading-tight">
            {dados.total} lead(s) crítico(s) de atendimento
          </h2>
          <p className="text-sm text-red-800 mt-0.5">
            {resumo}
            {dados.valorEmRisco > 0 ? ` · ${fmtBRL(dados.valorEmRisco)} em risco` : ''}.
            Do mais grave para o menos grave — abra no Kommo e resolva de cima para baixo.
          </p>

          <ul className="mt-3 divide-y divide-red-200 rounded-lg bg-white border border-red-200">
            {dados.leads.map(l => {
              const m = MOTIVO[l.motivo]
              const href = subdominio ? `https://${subdominio}.kommo.com/leads/detail/${l.leadId}` : null
              return (
                <li key={l.leadId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tracking-wide ${m.badge}`}>
                        {m.rotulo}
                      </span>
                      <p className="font-medium truncate">{l.nome}</p>
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {m.texto(l.dias)}
                      {l.etapa !== '—' ? ` · ${l.etapa}` : ''}
                      {l.valor > 0 ? ` · ${fmtBRL(l.valor)}` : ''}
                      {mostrarColaborador ? ` · ${l.colaborador}` : ''}
                    </p>
                  </div>
                  {href && (
                    <a href={href} target="_blank" rel="noopener noreferrer"
                       className="shrink-0 inline-flex items-center gap-1 rounded-md bg-red-600 text-white text-xs font-medium px-2.5 h-8 hover:bg-red-700">
                      Abrir <ExternalLink size={12} />
                    </a>
                  )}
                </li>
              )
            })}
          </ul>

          {ocultos > 0 && (
            <p className="text-xs text-red-700 mt-2">
              Mostrando os {dados.leads.length} mais graves — faltam outros {ocultos} no Kommo.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
