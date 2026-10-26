'use client'
import { useRouter } from 'next/navigation'
import { ChevronLeft, ChevronRight, Printer, Smartphone, Target, Trophy, Wrench } from 'lucide-react'
import { MarcaCanal } from '@/components/marca-canal'
import { Button } from '@/components/ui/button'
import type { DadosColetiva } from '@/lib/queries/coletiva'
import { maioresCrescimentos, estreantes, crescimento, type IconeOportunidade } from '@/lib/coletiva'
import { nomeMes, mesAnterior, formatarMes, pctMeta, classeMeta } from '@/lib/fechamento'

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const brlk = (n: number) => 'R$ ' + (n / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + ' mil'
const sPct = (n: number | null) => (n == null ? '—' : (n >= 0 ? '+' : '') + n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%')
const pct = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 0 }) + '%'

// 1º dourado, 2º prata, 3º azul; do 4º em diante a barra fica neutra.
const POSICAO_TEXTO = ['text-warning', 'text-muted-foreground', 'text-info']
const POSICAO_BARRA = ['bg-warning/15', 'bg-muted-foreground/18', 'bg-info/15']

const ICONE_OPORTUNIDADE: Record<Exclude<IconeOportunidade, 'Canal'>, typeof Target> = { Smartphone, Wrench, Target }

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

  const maxQtd = Math.max(...dados.vendedores.map(v => v.qtd), 1)
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
          {recorde ? `${nomeMes(dados.ano, dados.mes).split(' ')[0]} foi de crescimento.`
            : cresceu ? 'Mais um mês no ritmo.'
            : `Bora virar o jogo em ${nomeMes(seg.ano, seg.mes).split(' ')[0]}.`}
        </h1>
        <p className="mt-3 text-muted-foreground max-w-2xl">
          Resultado do time inteiro. Obrigado a cada um de vocês por cada atendimento e cada venda.
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
            {metaP == null
              ? <div className="text-lg font-semibold text-muted-foreground leading-9">Sem meta definida</div>
              : <div className="text-3xl font-extrabold tabular-nums">{pct(metaP)}</div>}
            <div className="text-xs text-muted-foreground mt-1">{metaP == null ? 'meta do mês' : 'da meta'}</div>
          </div>
        </div>
      </section>

      {/* Ranking */}
      <section className="rounded-2xl border border-border bg-card p-7 print:p-5">
        <SecTitle>Ranking do mês</SecTitle>
        <p className="text-muted-foreground mb-6">Os que mais venderam, por número de motos.</p>
        <ol className="space-y-1.5">
          {dados.vendedores.map((v, i) => (
            <li key={v.usuarioId} className="grid grid-cols-[2.25rem_1fr_auto] items-center gap-3">
              <span className={`text-right font-bold tabular-nums ${POSICAO_TEXTO[i] ?? 'text-muted-foreground'}`}>{i + 1}º</span>
              <div className="relative h-9 rounded-md overflow-hidden">
                {/* A tela é projetada e impressa: sem print-color-adjust o navegador some com a barra no papel. */}
                <div
                  className={`absolute inset-y-0 left-0 rounded-md ${POSICAO_BARRA[i] ?? 'bg-primary/14'}`}
                  style={{ width: `${(v.qtd / maxQtd) * 100}%`, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
                />
                <div className="relative flex h-full items-center gap-2 px-3 whitespace-nowrap">
                  {i === 0 && <Trophy size={15} className="shrink-0 text-warning" aria-hidden />}
                  <span className={i < 3 ? 'font-bold' : 'font-medium'}>{v.nome}</span>
                  <span className="text-sm text-muted-foreground truncate">{v.loja}</span>
                </div>
              </div>
              <span className="tabular-nums text-right"><b>{v.qtd}</b> <span className="text-sm text-muted-foreground">{v.qtd === 1 ? 'moto' : 'motos'}</span></span>
            </li>
          ))}
        </ol>
      </section>

      {/* Quem mais cresceu */}
      {(cresc.length > 0 || estreias.length > 0) && (
        <section className="rounded-2xl border border-border bg-card p-7 print:p-5">
          <SecTitle>Quem mais cresceu</SecTitle>
          <p className="text-muted-foreground mb-6">Não é só quem vende mais: é quem deu o maior salto sobre {nomeMes(ant.ano, ant.mes).split(' ')[0]}.</p>
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
                {estreias.map(e => `${e.nome} (${e.loja}) com ${e.qtd} moto${e.qtd > 1 ? 's' : ''}`).join(', ')}. Bem-vindos!
              </span>
            </div>
          )}
        </section>
      )}

      {/* Metas por loja */}
      {lojasComMeta.length > 0 && (
        <section className="rounded-2xl border border-border bg-card p-7 print:p-5">
          <SecTitle>As lojas e as metas</SecTitle>
          <p className="text-muted-foreground mb-6">
            {bateram.length > 0 ? `${bateram.length} loja${bateram.length > 1 ? 's' : ''} bateu a meta. ` : ''}
            {foco.length > 0 ? 'As outras chegaram perto: dá pra virar.' : 'Mandaram bem demais!'}
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
        <SecTitle>Modelos campeões</SecTitle>
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
        <SecTitle>Onde está a próxima virada</SecTitle>
        <p className="text-muted-foreground mb-6">Time bom comemora o resultado e já enxerga a próxima oportunidade.</p>
        <div className="space-y-3">
          {dados.oportunidades.map((op, i) => {
            const Icone = op.icone === 'Canal' ? null : ICONE_OPORTUNIDADE[op.icone]
            return (
              <div key={i} className="flex gap-3 rounded-xl border border-border p-4">
                {Icone
                  ? <Icone size={20} className="mt-0.5 shrink-0 text-primary-text" aria-hidden />
                  : <MarcaCanal canal={op.canal ?? ''} className="mt-0.5 shrink-0" />}
                <div>
                  <b className="block">{op.titulo}</b>
                  <span className="text-muted-foreground text-sm">{op.texto}</span>
                </div>
              </div>
            )
          })}
        </div>
      </section>

      {/* Fechamento */}
      <section className="rounded-2xl border border-border bg-primary-soft text-foreground p-8 text-center print:p-6">
        <h2 className="text-2xl font-bold">Obrigado, time.</h2>
        <p className="mt-2 text-muted-foreground max-w-xl mx-auto">
          O mês foi de vocês. Agora é manter o ritmo, cuidar de cada atendimento e ir pra cima do próximo recorde.
        </p>
      </section>
      </>
      )}
    </div>
  )
}
