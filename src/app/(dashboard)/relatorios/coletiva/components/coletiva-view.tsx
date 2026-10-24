'use client'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Printer } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { DadosColetiva } from '@/lib/queries/coletiva'
import { maioresCrescimentos, estreantes, crescimento } from '@/lib/coletiva'
import { nomeMes, mesAnterior, formatarMes, pctMeta, classeMeta } from '@/lib/fechamento'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlk = (n: number) => 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'
const sPct = (n: number | null) => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%')
const pct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%'

const MEDALHA = ['🥇', '🥈', '🥉']
const podCor = ['bg-warning/10 border-warning/30', 'bg-muted border-border', 'bg-warning/10 border-warning/30']

function SecTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="text-2xl font-bold mb-1 print:text-xl">{children}</h2>
}

export function ColetivaView({ dados, grupo, mes }: { dados: DadosColetiva; grupo: string; mes: string }) {
  const router = useRouter()
  const ir = (ano: number, m: number) => router.push(`/relatorios/coletiva?mes=${formatarMes(ano, m)}`)
  const ant = mesAnterior(dados.ano, dados.mes)
  const seg = dados.mes === 12 ? { ano: dados.ano + 1, mes: 1 } : { ano: dados.ano, mes: dados.mes + 1 }

  const c = dados.consolidado
  const vsMotos = crescimento(c.qtd, dados.anterior.qtd)
  const vsFat = crescimento(c.faturamento, dados.anterior.faturamento)
  // Meta compara contra o BRUTO (igual ao /admin/metas); o resto exibe líquido.
  const metaP = pctMeta(c.faturamentoBruto, dados.metaTotal)
  const cresceu = c.qtd > dados.anterior.qtd
  const recorde = cresceu && dados.anterior.qtd > 0

  const podio = dados.vendedores.slice(0, 3)
  const ordemVisual = [podio[1], podio[0], podio[2]].filter(Boolean) // 2º–1º–3º
  const restantes = dados.vendedores.slice(3)
  const cresc = maioresCrescimentos(dados.vendedores)
  const estreias = estreantes(dados.vendedores)
  const lojasComMeta = dados.lojas.filter(l => l.meta > 0)
  const bateram = lojasComMeta.filter(l => pctMeta(l.faturamentoBruto, l.meta)! >= 100)
  const foco = lojasComMeta.filter(l => pctMeta(l.faturamentoBruto, l.meta)! < 100)
  const maxMod = Math.max(...dados.modelos.map(m => m.total), 1)

  return (
    <div className="max-w-5xl mx-auto space-y-6 print:space-y-4">
      {/* Navegação de mês — não vai pra tela da reunião */}
      <div className="flex items-center justify-between gap-3 print:hidden">
        <p className="text-xs font-semibold uppercase tracking-widest text-success">Reunião de vendas · projeção</p>
        <div className="flex items-center gap-2">
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

      {c.qtd === 0 ? (
        <div className="rounded-2xl border border-border bg-muted p-10 text-center text-muted-foreground">
          Ainda não há vendas em {nomeMes(dados.ano, dados.mes)} para {grupo}.
        </div>
      ) : (
      <>
      {/* Capa */}
      <section className="rounded-2xl border border-border bg-primary-soft text-foreground p-9 print:p-6">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary-text">
          Reunião de vendas · {nomeMes(dados.ano, dados.mes)} · {grupo}
        </p>
        <h1 className="mt-3 text-4xl md:text-5xl font-extrabold leading-tight tracking-tight">
          {recorde ? `${nomeMes(dados.ano, dados.mes).split(' ')[0]} foi de crescimento. 🚀`
            : cresceu ? 'Mais um mês no ritmo. 💪'
            : `Bora virar o jogo em ${nomeMes(seg.ano, seg.mes).split(' ')[0]}. 🎯`}
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Resultado do time inteiro — obrigado a cada um de vocês por cada atendimento e cada venda.
        </p>
        <div className="mt-7 grid grid-cols-3 gap-px rounded-xl overflow-hidden bg-border">
          <div className="bg-card p-4">
            <div className="text-3xl font-extrabold tabular-nums">{c.qtd}</div>
            <div className="text-xs text-muted-foreground mt-1">motos vendidas {vsMotos != null && <span className="font-bold text-primary-text">{sPct(vsMotos)}</span>}</div>
          </div>
          <div className="bg-card p-4">
            <div className="text-3xl font-extrabold tabular-nums">{brlk(c.faturamento)}</div>
            <div className="text-xs text-muted-foreground mt-1">faturamento {vsFat != null && <span className="font-bold text-primary-text">{sPct(vsFat)}</span>}</div>
          </div>
          <div className="bg-card p-4">
            <div className="text-3xl font-extrabold tabular-nums">{metaP == null ? '—' : pct(metaP)}</div>
            <div className="text-xs text-muted-foreground mt-1">da meta{dados.metaTotal ? '' : ' (sem meta)'}</div>
          </div>
        </div>
      </section>

      {/* Pódio */}
      <section className="rounded-2xl border border-border bg-card p-7 print:p-5">
        <SecTitle>🏆 Pódio do mês</SecTitle>
        <p className="text-muted-foreground mb-6">Os que mais venderam — por número de motos. Que time!</p>
        <div className="grid grid-cols-3 gap-3 items-end mb-4">
          {ordemVisual.map(v => {
            const rank = dados.vendedores.indexOf(v)
            const alto = rank === 0
            return (
              <div key={v.usuarioId} className={`rounded-xl border p-4 text-center ${podCor[rank]} ${alto ? 'pb-6' : ''}`}>
                <div className="text-3xl">{MEDALHA[rank]}</div>
                <div className="font-bold text-lg mt-1">{v.nome}</div>
                <div className="text-xs text-muted-foreground">{v.loja}</div>
                <div className="text-3xl font-extrabold tabular-nums mt-2">{v.qtd}</div>
                <div className="text-sm text-muted-foreground font-medium">{brlk(v.total)}</div>
              </div>
            )
          })}
        </div>
        {restantes.length > 0 && (
          <div className="space-y-2">
            {restantes.map((v, i) => (
              <div key={v.usuarioId} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-3 py-2 rounded-lg border border-border">
                <span className="text-center font-bold text-muted-foreground">{i + 4}º</span>
                <span><b className="font-semibold">{v.nome}</b> <span className="text-muted-foreground text-sm ml-1">{v.loja}</span></span>
                <span className="tabular-nums text-muted-foreground"><b>{v.qtd}</b> <span className="text-muted-foreground text-sm">· {brlk(v.total)}</span></span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Quem mais cresceu */}
      {(cresc.length > 0 || estreias.length > 0) && (
        <section className="rounded-2xl border border-border bg-card p-7 print:p-5">
          <SecTitle>🚀 Quem mais cresceu</SecTitle>
          <p className="text-muted-foreground mb-6">Não é só quem vende mais — é quem deu o maior salto sobre {nomeMes(ant.ano, ant.mes).split(' ')[0]}.</p>
          {cresc.length > 0 && (
            <div className="space-y-2.5">
              {(() => { const mx = Math.max(...cresc.map(v => v.pct), 1); return cresc.map(v => (
                <div key={v.usuarioId} className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3">
                  <div className="text-sm font-medium truncate">{v.nome}</div>
                  <div className="h-5 rounded bg-muted overflow-hidden"><div className="h-full rounded bg-success" style={{ width: `${(v.pct / mx) * 100}%` }} /></div>
                  <div className="text-sm tabular-nums text-right whitespace-nowrap"><b className="text-success">+{Math.round(v.pct)}%</b> <span className="text-muted-foreground">· {v.qtd} motos</span></div>
                </div>
              )) })()}
            </div>
          )}
          {estreias.length > 0 && (
            <div className="mt-5 rounded-xl bg-success/10 p-4 text-sm">
              <b className="text-success">Estreias que já brilharam: </b>
              <span className="text-success">
                {estreias.map(e => `${e.nome} (${e.loja}) com ${e.qtd} moto${e.qtd > 1 ? 's' : ''}`).join(', ')}. Bem-vindos! 👏
              </span>
            </div>
          )}
        </section>
      )}

      {/* Metas por loja */}
      {lojasComMeta.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-7 print:p-5">
          <SecTitle>🎯 As lojas e as metas</SecTitle>
          <p className="text-muted-foreground mb-6">
            {bateram.length > 0 ? `${bateram.length} loja${bateram.length > 1 ? 's' : ''} bateu a meta. ` : ''}
            {foco.length > 0 ? 'As outras chegaram perto — dá pra virar.' : 'Mandaram bem demais! 🎉'}
          </p>
          <div className="grid md:grid-cols-2 gap-x-10 gap-y-2">
            {[...bateram, ...foco].map(l => {
              const p = pctMeta(l.faturamentoBruto, l.meta)
              const cls = classeMeta(p)
              const cor = cls === 'batida' ? 'bg-success/10 text-success' : cls === 'perto' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'
              return (
                <div key={l.loja} className="flex items-center gap-3 py-2 border-b border-border">
                  <span className="flex-1 font-medium">{l.loja}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cor}`}>{pct(p!)}</span>
                </div>
              )
            })}
          </div>
        </section>
      )}

      {/* Modelos campeões */}
      <section className="rounded-2xl border border-border bg-card p-7 print:p-5">
        <SecTitle>🏍️ Modelos campeões</SecTitle>
        <p className="text-muted-foreground mb-6">O que o cliente mais levou no mês.</p>
        <div className="space-y-2.5">
          {dados.modelos.slice(0, 8).map((m, i) => (
            <div key={i} className="grid grid-cols-[minmax(120px,180px)_1fr_auto] items-center gap-3">
              <div className="text-sm font-medium truncate">{m.nome}</div>
              <div className="h-5 rounded bg-muted overflow-hidden"><div className="h-full rounded bg-primary" style={{ width: `${(m.total / maxMod) * 100}%` }} /></div>
              <div className="text-sm tabular-nums text-right text-muted-foreground whitespace-nowrap"><b className="text-foreground">{m.qtd}</b> <span className="text-muted-foreground">· {brlk(m.total)}</span></div>
            </div>
          ))}
        </div>
      </section>

      {/* Oportunidades */}
      <section className="rounded-2xl border border-border bg-card p-7 print:p-5">
        <SecTitle>💡 Onde está a próxima virada</SecTitle>
        <p className="text-muted-foreground mb-6">Time bom comemora o resultado e já enxerga a próxima oportunidade.</p>
        <div className="space-y-3">
          {dados.oportunidades.map((op, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-border p-4">
              <span className="text-2xl leading-none">{op.icone}</span>
              <div>
                <b className="block">{op.titulo}</b>
                <span className="text-muted-foreground text-sm">{op.texto}</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Fechamento */}
      <section className="rounded-2xl border border-border bg-primary-soft text-foreground p-8 text-center print:p-6">
        <h2 className="text-2xl font-bold">Obrigado, time. 🙌</h2>
        <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
          O mês foi de vocês. Agora é manter o ritmo, cuidar de cada atendimento e ir pra cima do próximo recorde.
        </p>
      </section>
      </>
      )}
    </div>
  )
}
