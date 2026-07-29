import { Target, AlertTriangle, Clock, Trophy } from 'lucide-react'

type Linha = {
  nome: string
  volume: number
  ganhos: number
  conversao: number
  semResposta: number
  comIncoming: number
  tempoRespSeg: number | null
}
type Placar = { linha: Linha; posicao: number | null; total: number; meta: number }

const fmtDur = (s: number | null) => s == null ? '—' : (s < 3600 ? `${Math.round(s / 60)}min` : `${(s / 3600).toFixed(1)}h`)

export function PlacarVendedor({ placar, mes }: { placar: Placar; mes: string }) {
  const { linha: l, posicao, total, meta } = placar
  const semLeads = l.volume === 0
  const bateMeta = !semLeads && l.conversao >= meta
  const convPct = l.conversao * 100
  const progresso = Math.min(100, meta > 0 ? (l.conversao / meta) * 100 : 0)
  const faltam = Math.max(0, Math.ceil(l.volume * meta) - l.ganhos)

  return (
    <div className="rounded-xl bg-slate-900 text-white p-5 shadow-lg">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-xs font-bold tracking-widest text-slate-400 uppercase">🎯 Seu placar de atendimento · {mes}</h2>
        <span className="text-xs text-slate-500">{l.nome}</span>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {/* Conversão vs meta */}
        <div className={`rounded-lg p-4 ring-1 ${semLeads ? 'bg-white/5 ring-white/10' : bateMeta ? 'bg-green-500/15 ring-green-500/40' : 'bg-red-500/15 ring-red-500/50'}`}>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-300"><Target size={13} /> Conversão</div>
          <div className={`text-4xl font-black mt-1 ${semLeads ? 'text-slate-300' : bateMeta ? 'text-green-400' : 'text-red-400'}`}>
            {semLeads ? '—' : `${convPct.toFixed(1)}%`}
          </div>
          <div className="text-[11px] text-slate-400 mt-0.5">meta {Math.round(meta * 100)}%</div>
          <div className="mt-2 h-1.5 bg-white/10 rounded overflow-hidden">
            <div className={bateMeta ? 'bg-green-400 h-full' : 'bg-red-400 h-full'} style={{ width: `${progresso}%` }} />
          </div>
        </div>

        {/* Leads sem resposta */}
        <div className={`rounded-lg p-4 ring-1 ${l.semResposta > 0 ? 'bg-red-500/15 ring-red-500/50' : 'bg-white/5 ring-white/10'}`}>
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-300"><AlertTriangle size={13} /> Sem resposta</div>
          <div className={`text-4xl font-black mt-1 ${l.semResposta > 0 ? 'text-red-400' : 'text-slate-200'}`}>{l.semResposta}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{l.comIncoming > 0 ? `${Math.round(l.semResposta / l.comIncoming * 100)}% dos que te chamaram` : 'clientes sem retorno'}</div>
        </div>

        {/* 1ª resposta */}
        <div className="rounded-lg p-4 ring-1 bg-white/5 ring-white/10">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-300"><Clock size={13} /> 1ª resposta</div>
          <div className="text-4xl font-black mt-1 text-slate-100">{fmtDur(l.tempoRespSeg)}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">tempo típico</div>
        </div>

        {/* Ranking */}
        <div className="rounded-lg p-4 ring-1 bg-white/5 ring-white/10">
          <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-slate-300"><Trophy size={13} /> Ranking</div>
          <div className="text-4xl font-black mt-1 text-amber-300">{posicao ? `${posicao}º` : '—'}</div>
          <div className="text-[11px] text-slate-400 mt-0.5">{posicao ? `de ${total} no grupo` : 'sem leads ainda'}</div>
        </div>
      </div>

      <div className={`mt-4 text-sm font-semibold ${semLeads ? 'text-slate-300' : bateMeta ? 'text-green-400' : 'text-red-300'}`}>
        {semLeads
          ? 'Sem leads atribuídos a você no período ainda.'
          : bateMeta
            ? `🔥 Meta batida! Conversão ${convPct.toFixed(1)}% acima dos ${Math.round(meta * 100)}%. Mantém o ritmo.`
            : `⚠️ Abaixo da meta de ${Math.round(meta * 100)}%. Faltam ${faltam} venda(s) ganha(s) pra bater${l.semResposta > 0 ? ` — e ${l.semResposta} cliente(s) esperando você responder.` : '.'}`}
      </div>
    </div>
  )
}
