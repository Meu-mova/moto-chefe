import { Target, AlertTriangle, Clock, Trophy, Timer, CalendarClock, Flame, MessageSquare, Users } from 'lucide-react'
import type { CardsAtendimento } from '@/lib/queries/atendimento'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

export const fmtDur = (s: number | null) => {
  if (s == null) return '—'
  if (s < 60) return `${Math.round(s)}s`
  if (s < 3600) return `${Math.round(s / 60)}min`
  return `${(s / 3600).toFixed(1)}h`
}

// Verde até 5min, neutro até 15min, vermelho acima — mesma régua dos dois cards
// de tempo, pra o vendedor não precisar decorar dois critérios.
type Tom = 'ok' | 'neutro' | 'ruim'
const tomDoTempo = (s: number | null): Tom => s == null ? 'neutro' : s < 300 ? 'ok' : s < 900 ? 'neutro' : 'ruim'

const TOM_CAIXA: Record<Tom, string> = {
  ok: 'bg-success/10 ring-success/30',
  neutro: 'bg-muted ring-border',
  ruim: 'bg-destructive/10 ring-destructive/30',
}
const TOM_TEXTO: Record<Tom, string> = {
  ok: 'text-success',
  neutro: 'text-foreground',
  ruim: 'text-destructive',
}

function Card({
  icone, titulo, valor, rodape, tom = 'neutro', barra,
}: {
  icone: React.ReactNode
  titulo: string
  valor: string
  rodape: string
  tom?: Tom
  barra?: { pct: number; ok: boolean }
}) {
  return (
    <div className={`rounded-lg p-4 ring-1 ${TOM_CAIXA[tom]}`}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wide text-muted-foreground">{icone} {titulo}</div>
      <div className={`text-3xl font-black mt-1 ${TOM_TEXTO[tom]}`}>{valor}</div>
      <div className="text-[11px] text-muted-foreground mt-0.5">{rodape}</div>
      {barra && (
        <div className="mt-2 h-1.5 bg-muted rounded overflow-hidden">
          <div className={barra.ok ? 'bg-success h-full' : 'bg-destructive h-full'} style={{ width: `${barra.pct}%` }} />
        </div>
      )}
    </div>
  )
}

export function PainelAtendimento({ cards: c, mes }: { cards: CardsAtendimento; mes: string }) {
  const doVendedor = c.escopo === 'vendedor'
  const semLeads = c.volume === 0
  const bateMeta = !semLeads && c.conversao >= c.meta
  const progresso = Math.min(100, c.meta > 0 ? (c.conversao / c.meta) * 100 : 0)
  const faltam = Math.max(0, Math.ceil(c.volume * c.meta) - c.ganhos)

  return (
    <div className="rounded-xl border bg-card text-card-foreground p-5 shadow-lg">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-xs font-bold tracking-widest text-muted-foreground uppercase">
          🎯 {doVendedor ? 'Seu placar de atendimento' : 'Atendimento do grupo'} · {mes}
        </h2>
        <span className="text-xs text-muted-foreground">
          {doVendedor ? c.nome : `${c.colaboradores} colaborador(es) no Kommo`}
        </span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card
          icone={<Target size={13} />}
          titulo="Conversão"
          valor={semLeads ? '—' : `${(c.conversao * 100).toFixed(1)}%`}
          rodape={`meta ${Math.round(c.meta * 100)}% · ${c.ganhos}/${c.volume} leads`}
          tom={semLeads ? 'neutro' : bateMeta ? 'ok' : 'ruim'}
          barra={{ pct: progresso, ok: bateMeta }}
        />

        <Card
          icone={<CalendarClock size={13} />}
          titulo="Tarefas atrasadas"
          valor={String(c.tarefasAtrasadas)}
          rodape={
            c.tarefasAtrasadas > 0
              ? `de ${c.tarefasAbertas} aberta(s) · pior há ${c.maiorAtrasoDias} dia(s)`
              : `${c.tarefasAbertas} aberta(s) · ${c.tarefasVencemHoje} vence(m) hoje`
          }
          tom={c.tarefasAtrasadas > 0 ? 'ruim' : 'ok'}
        />

        <Card
          icone={<Clock size={13} />}
          titulo="1ª resposta"
          valor={fmtDur(c.primeiraRespMedianaSeg)}
          rodape={
            c.primeiraRespQtd > 0
              ? `mediana · 90% em até ${fmtDur(c.primeiraRespP90Seg)}`
              : 'sem lead respondido no período'
          }
          tom={tomDoTempo(c.primeiraRespMedianaSeg)}
        />

        <Card
          icone={<Timer size={13} />}
          titulo="Resposta média"
          valor={fmtDur(c.tempoMedioRespSeg)}
          rodape="ao longo da conversa, não só a 1ª"
          tom={tomDoTempo(c.tempoMedioRespSeg)}
        />

        <Card
          icone={<AlertTriangle size={13} />}
          titulo="Sem resposta"
          valor={String(c.semResposta)}
          rodape={c.comIncoming > 0
            ? `${Math.round(c.semResposta / c.comIncoming * 100)}% de quem ${doVendedor ? 'te' : 'nos'} chamou`
            : 'clientes sem retorno'}
          tom={c.semResposta > 0 ? 'ruim' : 'ok'}
        />

        <Card
          icone={<Flame size={13} />}
          titulo="Leads críticos"
          valor={String(c.criticos)}
          rodape={c.valorEmRisco > 0 ? `${fmtBRL(c.valorEmRisco)} em risco` : 'nada pendente agora'}
          tom={c.criticos > 0 ? 'ruim' : 'ok'}
        />

        <Card
          icone={<MessageSquare size={13} />}
          titulo="Atividade"
          valor={String(c.mensagens)}
          rodape={`mensagens · ${c.tarefasConcluidas} tarefa(s) concluída(s)`}
        />

        {doVendedor ? (
          <Card
            icone={<Trophy size={13} />}
            titulo="Ranking"
            valor={c.posicao ? `${c.posicao}º` : '—'}
            rodape={c.posicao ? `de ${c.totalRanking} no grupo` : 'sem leads ainda'}
          />
        ) : (
          <Card
            icone={<Users size={13} />}
            titulo="Leads no período"
            valor={String(c.volume)}
            rodape={`${c.colaboradores} colaborador(es) · ${c.totalRanking} com leads`}
          />
        )}
      </div>

      <div className={`mt-4 text-sm font-semibold ${semLeads ? 'text-muted-foreground' : bateMeta ? 'text-success' : 'text-destructive'}`}>
        {semLeads
          ? doVendedor
            ? 'Sem leads atribuídos a você no período ainda.'
            : 'Sem leads no período para as lojas selecionadas.'
          : bateMeta
            ? `🔥 Meta batida! Conversão ${(c.conversao * 100).toFixed(1)}% acima dos ${Math.round(c.meta * 100)}%. Mantém o ritmo.`
            : `⚠️ Abaixo da meta de ${Math.round(c.meta * 100)}%. Falta(m) ${faltam} venda(s) ganha(s) pra bater${c.tarefasAtrasadas > 0 ? ` — e ${c.tarefasAtrasadas} tarefa(s) já venceram.` : '.'}`}
      </div>
    </div>
  )
}
