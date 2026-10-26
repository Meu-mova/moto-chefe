'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Printer, Lock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DadosIndividual, VendedorIndividual } from '@/lib/queries/individual'
import { leitura, tempoResposta } from '@/lib/individual'
import { nomeMes, mesAnterior, formatarMes } from '@/lib/fechamento'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlk = (n: number) => 'R$ ' + Math.round(n / 1000) + ' mil'
const num = (n: number) => n.toLocaleString('pt-BR')

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: 'good' | 'bad' | 'warn' }) {
  const cls = tone === 'good' ? 'bg-success/10 border-success/30' : tone === 'bad' ? 'bg-destructive/10 border-destructive/30' : tone === 'warn' ? 'bg-warning/10 border-warning/30' : 'bg-card border-border'
  const vcls = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-destructive' : 'text-foreground'
  return (
    <div className={`rounded-lg border p-3.5 ${cls}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-xl font-bold tabular-nums mt-1 ${vcls}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  )
}

export function IndividualView({ dados, grupo, mes }: { dados: DadosIndividual; grupo: string; mes: string }) {
  const router = useRouter()
  const [idx, setIdx] = useState(0)
  const ir = (ano: number, m: number) => router.push(`/relatorios/individual?mes=${formatarMes(ano, m)}`)
  const ant = mesAnterior(dados.ano, dados.mes)
  const seg = dados.mes === 12 ? { ano: dados.ano + 1, mes: 1 } : { ano: dados.ano, mes: dados.mes + 1 }
  const total = dados.vendedores.length
  const v: VendedorIndividual | undefined = dados.vendedores[idx]

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-success">Conversa individual</p>
          <h1 className="text-2xl font-bold">{grupo} — {nomeMes(dados.ano, dados.mes)}</h1>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground bg-muted border border-border rounded-full px-3 py-1.5"><Lock size={12} /> Uso interno</span>
          <Button variant="outline" size="icon" onClick={() => ir(ant.ano, ant.mes)} aria-label="Mês anterior"><ChevronLeft size={16} /></Button>
          <input type="month" value={mes} onChange={e => { const [a, m] = e.target.value.split('-').map(Number); if (a && m) ir(a, m) }}
            className="border border-border rounded-md px-3 py-2 text-sm bg-card" />
          <Button variant="outline" size="icon" onClick={() => ir(seg.ano, seg.mes)} aria-label="Próximo mês"><ChevronRight size={16} /></Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer size={15} /> Imprimir</Button>
        </div>
      </div>

      {total === 0 || !v ? (
        <div className="rounded-lg border border-border bg-muted p-8 text-center text-muted-foreground">
          Nenhum vendedor com venda em {nomeMes(dados.ano, dados.mes)} para {grupo}.
        </div>
      ) : (
        <>
          <div className="print:hidden">
            <select value={idx} onChange={e => setIdx(Number(e.target.value))}
              className="border border-input rounded-lg px-4 py-2.5 text-[15px] font-semibold bg-card min-w-[260px]">
              {dados.vendedores.map((x, i) => <option key={x.usuarioId} value={i}>{x.nome} — {x.motos} motos</option>)}
            </select>
          </div>

          <Detalhe v={v} total={total} media={dados.media} />
        </>
      )}
    </div>
  )
}

function Sec({ children }: { children: React.ReactNode }) {
  return <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground mt-7 mb-4 first:mt-0">{children}<span className="flex-1 h-px bg-border" /></h2>
}

function CanalBars({ items }: { items: { nome: string; qtd: number }[] }) {
  if (!items.length) return <div className="text-sm text-muted-foreground">Sem dados no mês.</div>
  const max = Math.max(...items.map(i => i.qtd), 1)
  return (
    <div className="space-y-2.5">
      {items.map(it => (
        <div key={it.nome} className="grid grid-cols-[130px_1fr_auto] items-center gap-3">
          <div className="text-sm truncate">{it.nome}</div>
          <div className="h-5 rounded bg-muted overflow-hidden"><div className="h-full rounded bg-muted-foreground" style={{ width: `${(it.qtd / max) * 100}%` }} /></div>
          <div className="text-sm text-muted-foreground whitespace-nowrap"><b className="text-foreground">{it.qtd}</b></div>
        </div>
      ))}
    </div>
  )
}

function Detalhe({ v, total, media }: { v: VendedorIndividual; total: number; media: { conversao: number; tempoRespSeg: number; descontoPct: number } }) {
  const vs = v.faturamentoAnterior > 0 ? Math.round(((v.faturamento - v.faturamentoAnterior) / v.faturamentoAnterior) * 100) : null
  const vsTxt = vs == null ? <span className="text-success font-semibold">estreia no mês</span>
    : <span className={vs >= 0 ? 'text-success font-semibold' : 'text-destructive font-semibold'}>{vs >= 0 ? '+' : ''}{vs}% <span className="font-normal text-muted-foreground">vs mês ant.</span></span>
  const mMax = Math.max(...v.modelos.map(m => m.qtd), 1)
  const a = v.atendimento
  const { fortes, oportunidades } = leitura({ motos: v.motos, faturamento: v.faturamento, faturamentoAnterior: v.faturamentoAnterior, atendimento: a, descontoPct: v.desconto?.pct ?? null }, media)
  const respPct = a && a.comIncoming > 0 ? Math.round(((a.comIncoming - a.semResposta) / a.comIncoming) * 100) : null

  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap">
        <h2 className="text-2xl font-bold">{v.nome}</h2>
        <span className="text-muted-foreground text-sm">{v.loja} · {v.grupo}</span>
        <span className="text-xs font-bold bg-primary text-primary-foreground rounded-full px-3 py-1">{v.posicao} de {total}</span>
      </div>

      <Sec>Vendas no mês</Sec>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-px bg-border border border-border rounded-lg overflow-hidden">
        {[
          ['Motos', String(v.motos)], ['Faturamento', brlk(v.faturamento)], ['Ticket médio', brl(v.ticket)], ['Clientes', String(v.clientes)],
        ].map(([l, val]) => (
          <div key={l} className="bg-muted px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{l}</div><div className="text-lg font-bold tabular-nums mt-0.5">{val}</div></div>
        ))}
        <div className="bg-muted px-4 py-3"><div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">vs mês ant.</div><div className="text-sm font-bold mt-1.5">{vsTxt}</div></div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
        <Metric label="Desconto concedido" value={v.desconto ? brl(v.desconto.total) : '—'}
          sub={v.desconto ? `${v.desconto.qtd} venda(s) · ${v.desconto.pct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}% do faturamento (time ${media.descontoPct.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%)` : 'sem desconto no mês'}
          tone={v.desconto ? (v.desconto.pct > media.descontoPct + 1.5 ? 'bad' : v.desconto.pct <= 1 ? 'good' : 'warn') : undefined} />
        <Metric label="Vendas — MOVA × Kommo" value={`${v.motos} × ${a ? a.ganhos : '—'}`} sub="motos registradas no MOVA × leads ganhos no Kommo" />
      </div>

      <Sec>Modelos que mais vende</Sec>
      <div className="space-y-2.5">
        {v.modelos.map(m => (
          <div key={m.nome} className="grid grid-cols-[110px_1fr_auto] items-center gap-3">
            <div className="text-sm font-medium">{m.nome}</div>
            <div className="h-5 rounded bg-muted overflow-hidden"><div className="h-full rounded bg-success" style={{ width: `${(m.qtd / mMax) * 100}%` }} /></div>
            <div className="text-sm text-muted-foreground whitespace-nowrap"><b className="text-foreground">{m.qtd}</b> motos</div>
          </div>
        ))}
      </div>

      <Sec>Atendimento (Kommo)</Sec>
      {a ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Metric label="Leads recebidos" value={num(a.leads)} sub={respPct != null ? `${respPct}% respondidos` : undefined} />
          <Metric label="Tempo de resposta" value={tempoResposta(a.tempoRespSeg)} sub={`time: ${tempoResposta(media.tempoRespSeg)}`}
            tone={a.tempoRespSeg == null ? undefined : a.tempoRespSeg < 600 ? 'good' : a.tempoRespSeg > 7200 ? 'bad' : 'warn'} />
          <Metric label="Conversão (Kommo)" value={`${a.conversao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} sub={`time: ${media.conversao.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`}
            tone={a.conversao >= media.conversao ? 'good' : 'bad'} />
          <Metric label="Mensagens · Tarefas" value={`${num(a.mensagens)} · ${a.tarefas}`} sub="atividade no mês" />
          <Metric label="Leads sem resposta" value={String(a.semResposta)} sub={`de ${a.comIncoming} com contato`}
            tone={a.semResposta <= 15 ? 'good' : a.semResposta >= 50 ? 'bad' : 'warn'} />
          <Metric label="Ganhos · Perdidos" value={`${a.ganhos} · ${a.perdidos}`} sub="no funil Kommo" />
          <Metric label="Tarefas atrasadas" value={String(v.tarefas?.atrasadas ?? 0)} sub={v.tarefas ? `${v.tarefas.abertas} em aberto (agora)` : 'sem tarefas'}
            tone={(v.tarefas?.atrasadas ?? 0) > 0 ? 'bad' : 'good'} />
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-input p-4 text-center text-sm text-muted-foreground">
          Sem dados de atendimento (Kommo) para este vendedor no mês.
        </div>
      )}

      <Sec>Canais</Sec>
      <div className="grid md:grid-cols-2 gap-7">
        <div><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Canais de venda (origem)</p><CanalBars items={v.canaisVendas} /></div>
        <div><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Canais de lead (Kommo)</p><CanalBars items={v.canaisLeads} /></div>
      </div>

      <Sec>Leitura da conversa</Sec>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="rounded-lg border border-success/30 bg-success/10 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-success mb-2">Pontos fortes</h3>
          <ul className="list-disc pl-5 space-y-1.5">{fortes.map((t, i) => <li key={i} className="text-sm">{t}</li>)}</ul>
        </div>
        <div className="rounded-lg border border-warning/30 bg-warning/10 p-4">
          <h3 className="text-[11px] font-bold uppercase tracking-wide text-warning mb-2">Oportunidades</h3>
          <ul className="list-disc pl-5 space-y-1.5">{oportunidades.map((t, i) => <li key={i} className="text-sm">{t}</li>)}</ul>
        </div>
      </div>
    </div>
  )
}
