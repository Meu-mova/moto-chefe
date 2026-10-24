'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DadosFechamento, Item, LojaFechamento } from '@/lib/queries/fechamento'
import { nomeMes, mesAnterior, formatarMes, variacaoPct, pctMeta, classeMeta } from '@/lib/fechamento'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlk = (n: number) => 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'
const pct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + '%'
const sPct = (n: number | null) => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%')
const PGL: Record<string, string> = {
  pix: 'PIX', cartao_credito: 'Cartão de crédito', cartao_debito: 'Cartão de débito',
  dinheiro: 'Dinheiro', financiamento: 'Financiamento', transferencia: 'Transferência', link_pagamento: 'Link de pagamento',
}
const corMeta: Record<string, string> = {
  batida: 'bg-success/10 text-success', perto: 'bg-warning/10 text-warning',
  abaixo: 'bg-destructive/10 text-destructive', sem: 'bg-muted text-muted-foreground',
}
const flagOrigem = (n: string) => /^\(sem|^Não inf/i.test(n)
const flagCartao = (n: string) => /credito|debito|link/i.test(n)
// Base do % das formas de pagamento: a própria soma (bruto do que o cliente pagou),
// não o faturamento — que agora é líquido e faria os métodos passarem de 100%.
const somaItens = (items: Item[]) => items.reduce((s, i) => s + i.total, 0)

function Bars({ items, pctBase, mapNome, corFill }: {
  items: Item[]; pctBase?: number; mapNome?: (n: string) => string; corFill?: (n: string) => string
}) {
  const max = Math.max(...items.map(i => i.total), 1)
  return (
    <div className="space-y-2.5">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3">
          <div className="text-sm text-foreground truncate">{mapNome ? mapNome(it.nome) : it.nome}</div>
          <div className="h-5 rounded bg-muted overflow-hidden">
            <div className={`h-full rounded ${corFill ? corFill(it.nome) : 'bg-primary'}`} style={{ width: `${(it.total / max) * 100}%` }} />
          </div>
          <div className="text-sm text-muted-foreground tabular-nums whitespace-nowrap min-w-[96px] text-right">
            <b className="font-semibold text-foreground">{pctBase ? pct((it.total / pctBase) * 100) : brlk(it.total)}</b>
            <span className="text-muted-foreground"> · {it.qtd}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

function Kpi({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div className="bg-muted p-4 flex flex-col gap-1">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      <span className="text-2xl font-bold tabular-nums leading-none">{value}</span>
      {sub && <span className="text-xs text-muted-foreground">{sub}</span>}
    </div>
  )
}

function SecTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-4">
      {children}<span className="flex-1 h-px bg-muted" />
    </h2>
  )
}

export function FechamentoView({ dados, grupo, mes }: { dados: DadosFechamento; grupo: string; mes: string }) {
  const router = useRouter()
  const [lojaIdx, setLojaIdx] = useState(0)

  const ir = (ano: number, m: number) => router.push(`/relatorios/fechamento?mes=${formatarMes(ano, m)}`)
  const ant = mesAnterior(dados.ano, dados.mes)
  const seg = dados.mes === 12 ? { ano: dados.ano + 1, mes: 1 } : { ano: dados.ano, mes: dados.mes + 1 }

  const c = dados.consolidado
  const faturamentoTotal = c.faturamento + dados.servicos.total + dados.pecasBalcao.total
  const vsAnterior = variacaoPct(c.faturamento, dados.anterior.faturamento)
  // Meta compara contra o BRUTO (igual ao /admin/metas); o resto exibe líquido.
  const metaP = pctMeta(c.faturamentoBruto, dados.metaTotal)
  const dl = (k: string) => dados.dre.find(l => l.chave === k)?.valor ?? 0
  const resultado = dl('resultado')

  const corFillCartao = (n: string) => (flagCartao(n) ? 'bg-warning' : 'bg-success')
  const corFillOrigem = (n: string) => (flagOrigem(n) ? 'bg-warning' : 'bg-primary')
  const semVendas = c.qtd === 0

  return (
    <div className="space-y-6 print:space-y-4">
      {/* Cabeçalho + navegação de mês */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-widest text-success">Fechamento mensal</p>
          <h1 className="text-2xl font-bold">{grupo} — {nomeMes(dados.ano, dados.mes)}</h1>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <Button variant="outline" size="icon" onClick={() => ir(ant.ano, ant.mes)} aria-label="Mês anterior"><ChevronLeft size={16} /></Button>
          <input
            type="month" value={mes} max={formatarMes(new Date().getFullYear() + 1, 12)}
            onChange={e => e.target.value && ir(...(e.target.value.split('-').map(Number) as [number, number]))}
            className="border border-border rounded-md px-3 py-2 text-sm bg-card"
          />
          <Button variant="outline" size="icon" onClick={() => ir(seg.ano, seg.mes)} aria-label="Próximo mês"><ChevronRight size={16} /></Button>
          <Button variant="outline" onClick={() => window.print()} className="gap-1.5"><Printer size={15} /> Imprimir</Button>
        </div>
      </div>

      {semVendas ? (
        <div className="rounded-lg border border-border bg-muted p-8 text-center text-muted-foreground">
          Nenhuma venda registrada em {nomeMes(dados.ano, dados.mes)} para {grupo}.
        </div>
      ) : (
      <>
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-muted border border-border rounded-xl overflow-hidden">
        <Kpi label="Faturamento total" value={brl(faturamentoTotal)} sub="motos (líquido), serviços e peças" />
        <Kpi label="Motos vendidas" value={String(c.qtd)} sub={<span className={vsAnterior != null && vsAnterior >= 0 ? 'text-success font-semibold' : 'text-destructive font-semibold'}>{sPct(vsAnterior)} vs mês anterior</span>} />
        <Kpi label="Ticket médio" value={brl(c.ticket)} sub="por moto" />
        <Kpi label="Meta consolidada" value={metaP == null ? '—' : pct(metaP)} sub={dados.metaTotal ? `${brlk(c.faturamentoBruto)} bruto de ${brlk(dados.metaTotal)}` : 'sem meta cadastrada'} />
        <Kpi label="Resultado (DRE)" value={brl(resultado)} sub={<span className={resultado >= 0 ? 'text-success' : 'text-destructive'}>resultado operacional</span>} />
        <Kpi label="Clientes atendidos" value={String(c.clientes)} sub="no mês" />
      </div>

      {/* DRE resumido */}
      <section>
        <SecTitle>Resultado do mês (DRE)</SecTitle>
        <div className="rounded-lg border border-border overflow-hidden">
          {[
            ['receita_bruta', 'Receita bruta', false],
            ['taxas_cartao', '(−) Taxas de cartão', true],
            ['receita_liquida', 'Receita líquida', false],
            ['cmv', '(−) CMV — motos', true],
            ['lucro_bruto', 'Lucro bruto', false],
            ['despesas_total', '(−) Despesas operacionais', true],
            ['resultado', 'Resultado operacional', false],
          ].map(([k, rot, ded], i) => {
            const v = dl(k as string)
            const isResult = k === 'resultado'
            return (
              <div key={i} className={`flex justify-between px-4 py-2 text-sm ${isResult ? 'bg-primary text-primary-foreground font-bold' : i % 2 ? 'bg-muted' : 'bg-card'}`}>
                <span className={ded ? 'text-muted-foreground' : 'font-medium'}>{rot as string}</span>
                <span className={`tabular-nums ${!isResult && (ded ? 'text-muted-foreground' : 'font-semibold')}`}>{ded ? '− ' : ''}{brl(Math.abs(v))}</span>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2">Mesmos números do <a href="/admin/dre" className="underline">DRE</a>. Taxa de cartão entra como dedução da receita; imposto fica nas despesas (Tributos).</p>
      </section>

      {/* Ritmo diário */}
      <section>
        <SecTitle>Ritmo do mês</SecTitle>
        <div className="flex items-end gap-1.5 h-36">
          {dados.diario.map((d, i) => {
            const max = Math.max(...dados.diario.map(x => x.total), 1)
            const isMax = d.total === max
            return (
              <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1.5 h-full" title={`${d.dia} — ${d.qtd} motos · ${brl(d.total)}`}>
                <div className={`w-full max-w-[24px] rounded-t ${isMax ? 'bg-success' : 'bg-muted-foreground'}`} style={{ height: `${Math.max(4, (d.total / max) * 120)}px` }} />
                <span className="text-[9px] text-muted-foreground">{d.dia}</span>
              </div>
            )
          })}
        </div>
      </section>

      {/* Metas por loja */}
      {dados.porLoja.some(l => l.meta > 0) && (
        <section>
          <SecTitle>Metas por loja</SecTitle>
          <div className="space-y-3">
            {dados.porLoja.map(l => {
              const p = pctMeta(l.faturamentoBruto, l.meta)
              const cls = classeMeta(p)
              const fill = cls === 'batida' ? 'bg-success' : cls === 'perto' ? 'bg-warning' : cls === 'abaixo' ? 'bg-destructive' : 'bg-muted-foreground'
              const w = p == null ? 0 : Math.min(100, (p / 135) * 100)
              return (
                <div key={l.lojaId} className="grid grid-cols-[minmax(110px,170px)_1fr_auto] items-center gap-3">
                  <div className="text-sm font-medium truncate">{l.loja}</div>
                  <div className="relative h-5 rounded bg-muted overflow-hidden">
                    <div className={`h-full rounded ${fill}`} style={{ width: `${w}%` }} />
                    {l.meta > 0 && <div className="absolute top-[-3px] bottom-[-3px] w-0.5 bg-foreground/60" style={{ left: `${(1 / 1.35) * 100}%` }} />}
                  </div>
                  <div className="text-sm tabular-nums whitespace-nowrap text-right">
                    <b>{brlk(l.faturamentoBruto)}</b> <span className="text-muted-foreground">/ {l.meta ? brlk(l.meta) : '—'}</span>
                    <span className={`ml-2 inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${corMeta[cls]}`}>{p == null ? 'sem meta' : pct(p)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Desempenho por loja */}
      <section>
        <SecTitle>Desempenho por loja</SecTitle>
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground border-b border-border">
                <th className="px-4 py-2.5 font-medium">Loja</th>
                <th className="px-4 py-2.5 font-medium text-right">Motos</th>
                <th className="px-4 py-2.5 font-medium text-right">Faturamento</th>
                <th className="px-4 py-2.5 font-medium text-right">Ticket</th>
                <th className="px-4 py-2.5 font-medium text-right">vs mês ant.</th>
                <th className="px-4 py-2.5 font-medium text-right">Meta</th>
              </tr>
            </thead>
            <tbody>
              {dados.porLoja.map(l => {
                const v = variacaoPct(l.faturamento, l.faturamentoAnterior)
                const p = pctMeta(l.faturamentoBruto, l.meta)
                const cls = classeMeta(p)
                return (
                  <tr key={l.lojaId} className="border-b border-border last:border-0 hover:bg-muted">
                    <td className="px-4 py-2.5 font-medium">{l.loja}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{l.qtd}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{brl(l.faturamento)}</td>
                    <td className="px-4 py-2.5 text-right tabular-nums text-muted-foreground">{brl(l.ticket)}</td>
                    <td className={`px-4 py-2.5 text-right tabular-nums ${v != null && v >= 0 ? 'text-success' : 'text-destructive'}`}>{sPct(v)}</td>
                    <td className="px-4 py-2.5 text-right"><span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold ${corMeta[cls]}`}>{p == null ? '—' : pct(p)}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Vendedores + Modelos (grupo) */}
      <section className="grid md:grid-cols-2 gap-7">
        <div><SecTitle>Ranking de vendedores</SecTitle><Bars items={dados.vendedores} corFill={() => 'bg-success'} /></div>
        <div><SecTitle>Mix de produtos</SecTitle><Bars items={dados.modelos} pctBase={c.faturamento} /></div>
      </section>

      {/* Origem + Pagamento (grupo) */}
      <section className="grid md:grid-cols-2 gap-7">
        <div><SecTitle>Origem das vendas</SecTitle><Bars items={dados.origem} corFill={corFillOrigem} /></div>
        <div><SecTitle>Formas de pagamento</SecTitle><Bars items={dados.pagamento} pctBase={somaItens(dados.pagamento)} mapNome={n => PGL[n] ?? n} corFill={corFillCartao} /></div>
      </section>

      {/* Serviços / estoque */}
      <section>
        <SecTitle>Serviços, peças e pós-venda</SecTitle>
        <div className="grid md:grid-cols-2 gap-7">
          <div className="rounded-lg border border-border bg-muted p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Oficina (Ordens de Serviço)</h3>
            <Linha l="OS concluídas" v={String(dados.servicos.qtd)} />
            <Linha l="Faturamento em serviços" v={brl(dados.servicos.total)} />
            <Linha l="Mão de obra / peças" v={`${brl(dados.servicos.servicos)} / ${brl(dados.servicos.pecas)}`} />
          </div>
          <div className="rounded-lg border border-border bg-muted p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Peças, garantias e estoque</h3>
            <Linha l="Vendas de peças (balcão)" v={`${brl(dados.pecasBalcao.total)} · ${dados.pecasBalcao.qtd}`} />
            <Linha l="Garantias abertas" v={String(dados.garantias)} />
            <Linha l="Motos em estoque (hoje)" v={String(dados.estoque)} />
          </div>
        </div>
      </section>

      {/* Drill-down por loja */}
      {dados.porLoja.length > 1 && (
        <section>
          <SecTitle>Análise individual por loja</SecTitle>
          <div className="flex flex-wrap gap-2 mb-5 print:hidden">
            {dados.porLoja.map((l, i) => (
              <button key={l.lojaId} onClick={() => setLojaIdx(i)}
                className={`text-sm font-semibold px-3.5 py-2 rounded-lg border ${i === lojaIdx ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border hover:border-input'}`}>
                {l.loja}<span className="ml-1.5 font-normal text-xs opacity-75">{brlk(l.faturamento)}</span>
              </button>
            ))}
          </div>
          <LojaDetalhe loja={dados.porLoja[lojaIdx]} corFillCartao={corFillCartao} corFillOrigem={corFillOrigem} />
        </section>
      )}
      </>
      )}
    </div>
  )
}

function Linha({ l, v }: { l: string; v: string }) {
  return (
    <div className="flex justify-between items-baseline py-1.5 border-b border-dashed border-border last:border-0 text-sm">
      <span className="text-muted-foreground">{l}</span><b className="font-semibold tabular-nums">{v}</b>
    </div>
  )
}

function LojaDetalhe({ loja, corFillCartao, corFillOrigem }: {
  loja: LojaFechamento; corFillCartao: (n: string) => string; corFillOrigem: (n: string) => string
}) {
  const v = variacaoPct(loja.faturamento, loja.faturamentoAnterior)
  const p = pctMeta(loja.faturamentoBruto, loja.meta)
  const cls = classeMeta(p)
  return (
    <div>
      <div className="flex items-center gap-3 flex-wrap mb-4">
        <h3 className="text-xl font-bold">{loja.loja}</h3>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${corMeta[cls]}`}>{p == null ? 'sem meta' : `${pct(p)} da meta`}</span>
        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${v != null && v >= 0 ? 'bg-success/10 text-success' : 'bg-destructive/10 text-destructive'}`}>{sPct(v)} vs mês ant.</span>
      </div>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-px bg-muted border border-border rounded-lg overflow-hidden mb-6">
        <MiniKpi l="Motos" v={String(loja.qtd)} />
        <MiniKpi l="Faturamento" v={brlk(loja.faturamento)} />
        <MiniKpi l="Ticket" v={brl(loja.ticket)} />
        <MiniKpi l="Clientes" v={String(loja.clientes)} />
        <MiniKpi l="Meta" v={loja.meta ? brlk(loja.meta) : '—'} />
        <MiniKpi l="OS" v={`${loja.os.qtd} · ${brlk(loja.os.total)}`} />
      </div>
      <div className="grid md:grid-cols-2 gap-7 mb-6">
        <div><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Vendedores</p><Bars items={loja.vendedores} corFill={() => 'bg-success'} /></div>
        <div><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Mix de produtos</p><Bars items={loja.modelos} pctBase={loja.faturamento} /></div>
      </div>
      <div className="grid md:grid-cols-2 gap-7">
        <div><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Origem das vendas</p><Bars items={loja.origem} corFill={corFillOrigem} /></div>
        <div><p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">Formas de pagamento</p><Bars items={loja.pagamento} pctBase={somaItens(loja.pagamento)} mapNome={n => PGL[n] ?? n} corFill={corFillCartao} /></div>
      </div>
    </div>
  )
}

function MiniKpi({ l, v }: { l: string; v: string }) {
  return (
    <div className="bg-muted px-3 py-2.5">
      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">{l}</div>
      <div className="text-base font-bold tabular-nums mt-0.5">{v}</div>
    </div>
  )
}
