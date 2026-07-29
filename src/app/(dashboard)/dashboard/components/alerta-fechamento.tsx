import { AlertTriangle, CheckCircle2, ExternalLink } from 'lucide-react'

type Lead = { leadId: number; nome: string; etapa: string; valor: number; dias: number }
type Dados = { naEtapa: number; semTarefa: number; valorParado: number; leads: Lead[] }

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function AlertaFechamento({ dados, subdominio }: { dados: Dados; subdominio: string | null }) {
  const link = (id: number) => subdominio ? `https://${subdominio}.kommo.com/leads/detail/${id}` : null

  if (dados.semTarefa === 0) {
    return (
      <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800 flex items-center gap-2">
        <CheckCircle2 size={16} className="shrink-0" />
        <span>Todos os {dados.naEtapa} lead(s) seus em interesse/negociação têm tarefa agendada. Segue o jogo.</span>
      </div>
    )
  }

  const ocultos = dados.semTarefa - dados.leads.length

  return (
    <div className="rounded-xl border-2 border-red-500 bg-red-50 p-5 shadow-lg">
      <div className="flex items-start gap-3">
        <AlertTriangle size={26} className="text-red-600 shrink-0 mt-0.5" />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-black text-red-700 leading-tight">
            {dados.semTarefa} lead(s) prestes a fechar SEM tarefa agendada
          </h2>
          <p className="text-sm text-red-800 mt-0.5">
            De {dados.naEtapa} lead(s) seus em interesse/negociação, {dados.semTarefa} estão sem próximo passo marcado
            {dados.valorParado > 0 ? ` (${fmtBRL(dados.valorParado)} parados)` : ''}.
            Todo lead nessas etapas precisa de uma tarefa de fechamento — agende agora no Kommo.
          </p>

          <ul className="mt-3 divide-y divide-red-200 rounded-lg bg-white border border-red-200">
            {dados.leads.map(l => {
              const href = link(l.leadId)
              return (
                <li key={l.leadId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{l.nome}</p>
                    <p className="text-xs text-slate-500">
                      {l.etapa} · parado há {l.dias} dia(s){l.valor > 0 ? ` · ${fmtBRL(l.valor)}` : ''}
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
              Mostrando os {dados.leads.length} parados há mais tempo — faltam outros {ocultos} no Kommo.
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
