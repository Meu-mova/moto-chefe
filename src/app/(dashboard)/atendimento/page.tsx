import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { getKommoStatus, sincronizarSeNecessario } from '@/lib/kommo'
import { metricasAtendimento, slaAtendimento, motivosDePerda, fechamentoSemTarefa, funisSemEtapaDetectada } from '@/lib/queries/atendimento'
import { AtendimentoChart } from './components/atendimento-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Headset, RefreshCw, AlertTriangle, TriangleAlert, CheckCircle2, ExternalLink } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtDur = (s: number | null) => {
  if (s == null) return '—'
  const min = Math.round(s / 60)
  if (min < 60) return `${min}min`
  const h = min / 60
  return h < 24 ? `${h.toFixed(1)}h` : `${Math.round(h / 24)}d`
}

export default async function AtendimentoPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; sync?: string }> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/atendimento')) redirect('/dashboard')

  const params = await searchParams
  const status = await getKommoStatus()
  const grupo = await getGrupoAtivo(usuario)
  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)

  const hoje = new Date()
  const deDefault = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const ateDefault = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  const ateDefaultStr = `${ateDefault.getFullYear()}-${String(ateDefault.getMonth() + 1).padStart(2, '0')}-${String(ateDefault.getDate()).padStart(2, '0')}`
  const de = params.de || deDefault
  const ate = params.ate || ateDefaultStr
  const inicio = new Date(de + 'T00:00:00')
  const fim = new Date(ate + 'T23:59:59')

  let ultimaSync: Date | null = null
  let erroSync: string | null = null
  if (status.conectado) {
    const r = await sincronizarSeNecessario(params.sync === '1')
    ultimaSync = r.ultima
    erroSync = r.erro
  }

  const [linhas, sla, perdas, fechamento, funisSemEtapa] = status.conectado
    ? await Promise.all([
        metricasAtendimento(inicio, fim, de, ate, lojaIds),
        slaAtendimento(inicio, fim, lojaIds),
        motivosDePerda(inicio, fim, lojaIds),
        // 5 leads por colaborador: com centenas de descobertos, a lista cheia
        // viraria uma parede — o total continua completo nas contagens.
        fechamentoSemTarefa(lojaIds, undefined, 5),
        funisSemEtapaDetectada(),
      ])
    : [[], { sla5: 0, sla15: 0, sla60: 0, slaMais: 0, semResposta: 0, respondidos: 0 }, { motivos: [], total: 0, semMotivo: 0 },
       { porColaborador: [], naEtapa: 0, semTarefa: 0, valorParado: 0, cobertura: 1, leads: [] }, []]
  const tot = linhas.reduce((a, l) => ({
    volume: a.volume + l.volume,
    ganhos: a.ganhos + l.ganhos,
    perdidos: a.perdidos + l.perdidos,
    valor: a.valor + l.valor,
    ganhosSemValor: a.ganhosSemValor + l.ganhosSemValor,
    semResposta: a.semResposta + l.semResposta,
    comIncoming: a.comIncoming + l.comIncoming,
  }), { volume: 0, ganhos: 0, perdidos: 0, valor: 0, ganhosSemValor: 0, semResposta: 0, comIncoming: 0 })
  const convTotal = tot.volume ? Math.round((tot.ganhos / tot.volume) * 100) : 0
  const pctSemResp = tot.comIncoming ? Math.round((tot.semResposta / tot.comIncoming) * 100) : 0
  const slaTotal = sla.respondidos || 1
  const pct = (n: number) => Math.round((n / slaTotal) * 100)

  const coberturaPct = Math.round(fechamento.cobertura * 100)
  const linkLead = (id: number) => status.subdominio ? `https://${status.subdominio}.kommo.com/leads/detail/${id}` : null

  const qsPeriodo = `de=${de}&ate=${ate}`

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Headset size={22} /> Atendimento — {grupo.nome}</h1>
          <p className="text-muted-foreground text-sm">Métricas de atendimento por colaborador (Kommo CRM) · grupo {grupo.nome}</p>
        </div>
        <div className="flex items-center gap-3">
          {ultimaSync && (
            <span className="text-xs text-muted-foreground">
              Atualizado {format(new Date(ultimaSync), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </span>
          )}
          <Link
            href={`/atendimento?${qsPeriodo}&sync=1`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm hover:bg-muted"
          >
            <RefreshCw size={14} /> Atualizar agora
          </Link>
        </div>
      </div>

      {!status.conectado && (
        <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 text-sm text-warning flex items-center gap-2">
          <AlertTriangle size={16} /> Kommo não conectado. Configure em <Link href="/admin/kommo" className="underline font-medium">Admin → Kommo</Link>.
        </div>
      )}
      {erroSync && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive flex items-center gap-2">
          <AlertTriangle size={16} /> Falha ao sincronizar com o Kommo: {erroSync} (mostrando os últimos dados em cache)
        </div>
      )}

      {/* Filtro de período */}
      <form className="flex items-end gap-3 flex-wrap bg-card border rounded-lg p-4">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground block">De</label>
          <input type="date" name="de" defaultValue={de} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground block">Até</label>
          <input type="date" name="ate" defaultValue={ate} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <button type="submit" className="h-9 px-4 rounded-md bg-primary text-primary-foreground text-sm">Filtrar</button>
      </form>

      {status.conectado && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium">Leads atendidos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{tot.volume.toLocaleString('pt-BR')}</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium">Vendas ganhas</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-success">{tot.ganhos}</p><p className="text-xs text-muted-foreground">{tot.perdidos} perdidas</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium">Conversão</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{convTotal}%</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium">Valor ganho</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-success">{fmtBRL(tot.valor)}</p></CardContent></Card>
            <Card>
              <CardHeader className="pb-1"><CardTitle className="text-xs text-muted-foreground font-medium">Cobertura de fechamento</CardTitle></CardHeader>
              <CardContent>
                <p className={`text-2xl font-bold ${fechamento.semTarefa > 0 ? 'text-destructive' : 'text-success'}`}>{coberturaPct}%</p>
                <p className="text-xs text-muted-foreground">{fechamento.semTarefa} de {fechamento.naEtapa} sem tarefa</p>
              </CardContent>
            </Card>
          </div>

          {/* Alerta — leads sem resposta */}
          {tot.semResposta > 0 && (
            <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-4 py-3 text-sm text-destructive flex items-start gap-2">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">{tot.semResposta} lead(s) sem resposta ({pctSemResp}% dos que mandaram mensagem no período).</p>
                <p className="text-xs mt-0.5">O cliente falou e nenhum atendente respondeu — oportunidades sendo perdidas. Veja por colaborador na coluna "Sem resp.".</p>
              </div>
            </div>
          )}

          {/* Alerta de valor não informado */}
          {tot.ganhosSemValor > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 text-sm text-warning flex items-start gap-2">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Valor subestimado — {tot.ganhosSemValor} venda(s) ganha(s) sem valor informado no Kommo.</p>
                <p className="text-xs mt-0.5">O valor ganho acima está abaixo das vendas reais do mês. Peça aos vendedores para preencher o valor do lead no Kommo ao ganhar a venda.</p>
              </div>
            </div>
          )}

          {/* Aviso de configuração: funil sem etapa de fechamento detectada */}
          {funisSemEtapa.length > 0 && (
            <div className="bg-warning/10 border border-warning/30 rounded-lg px-4 py-3 text-sm text-warning flex items-start gap-2">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Funil sem etapa de fechamento detectada: {funisSemEtapa.join(', ')}.</p>
                <p className="text-xs mt-0.5">O sistema reconhece as etapas pelo nome (&quot;tem interesse&quot; / &quot;em negociação&quot;). Renomeie a etapa no Kommo para voltar a medir esse funil.</p>
              </div>
            </div>
          )}

          {/* Leads em interesse/negociação sem tarefa agendada — situação atual */}
          <Card className={fechamento.semTarefa > 0 ? 'border-2 border-destructive/50' : undefined}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2 flex-wrap">
                {fechamento.semTarefa > 0
                  ? <><AlertTriangle size={18} className="text-destructive" /> <span className="text-destructive">Leads prestes a fechar sem tarefa agendada</span></>
                  : <><CheckCircle2 size={18} className="text-success" /> Leads prestes a fechar sem tarefa agendada</>}
                <span className="text-xs font-normal text-muted-foreground">· situação atual, não depende do período</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {fechamento.naEtapa === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum lead nas etapas de interesse/negociação no momento.</p>
              ) : fechamento.semTarefa === 0 ? (
                <p className="text-sm text-success">Todos os {fechamento.naEtapa} leads em interesse/negociação têm tarefa agendada.</p>
              ) : (
                <>
                  <p className="text-sm text-destructive">
                    <strong>{fechamento.semTarefa}</strong> de {fechamento.naEtapa} leads nessas etapas estão sem próximo passo marcado
                    {fechamento.valorParado > 0 ? <> — <strong>{fmtBRL(fechamento.valorParado)}</strong> parados</> : null}.
                  </p>
                  {fechamento.porColaborador.filter(c => c.semTarefa > 0).map(c => (
                    <div key={c.kommoUserId} className="rounded-lg border">
                      <div className="flex items-center justify-between gap-2 bg-muted px-3 py-2 text-sm border-b flex-wrap">
                        <span className="font-medium">{c.nome}</span>
                        <span className="text-muted-foreground text-xs">
                          {c.semTarefa} de {c.naEtapa} sem tarefa · {Math.round(c.cobertura * 100)}% de cobertura
                          {c.valorParado > 0 ? ` · ${fmtBRL(c.valorParado)}` : ''}
                        </span>
                      </div>
                      <ul className="divide-y">
                        {c.leads.map(l => {
                          const href = linkLead(l.leadId)
                          return (
                            <li key={l.leadId} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                              <div className="min-w-0">
                                <p className="truncate">{l.nome}</p>
                                <p className="text-xs text-muted-foreground">{l.etapa} · parado há {l.dias} dia(s){l.valor > 0 ? ` · ${fmtBRL(l.valor)}` : ''}</p>
                              </div>
                              {href && (
                                <a href={href} target="_blank" rel="noopener noreferrer"
                                   className="shrink-0 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline">
                                  Abrir <ExternalLink size={12} />
                                </a>
                              )}
                            </li>
                          )
                        })}
                      </ul>
                      {c.semTarefa > c.leads.length && (
                        <p className="px-3 py-1.5 text-xs text-muted-foreground border-t">
                          Mostrando os {c.leads.length} parados há mais tempo — outros {c.semTarefa - c.leads.length} no Kommo.
                        </p>
                      )}
                    </div>
                  ))}
                </>
              )}
            </CardContent>
          </Card>

          <div className="space-y-4">
            {/* Ranking */}
            <Card>
              <CardHeader><CardTitle className="text-base">Ranking por colaborador</CardTitle></CardHeader>
              <CardContent className="p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted border-y text-muted-foreground">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Colaborador</th>
                      <th className="text-right px-3 py-2 font-medium">Leads</th>
                      <th className="text-right px-3 py-2 font-medium">Ganhos</th>
                      <th className="text-right px-3 py-2 font-medium">Perdidos</th>
                      <th className="text-right px-3 py-2 font-medium">Conv.</th>
                      <th className="text-right px-4 py-2 font-medium">Valor</th>
                      <th className="text-right px-3 py-2 font-medium">Msgs</th>
                      <th className="text-right px-3 py-2 font-medium">Tarefas</th>
                      <th className="text-right px-3 py-2 font-medium whitespace-nowrap">Sem resp.</th>
                      <th className="text-right px-4 py-2 font-medium whitespace-nowrap">1ª resp.</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {linhas.map((l, i) => (
                      <tr key={i} className="hover:bg-muted">
                        <td className="px-4 py-2 font-medium whitespace-nowrap">
                          {l.nome}
                          {!l.vinculado && <span className="ml-1 text-xs text-warning" title="Usuário do Kommo sem vínculo com o Mova">·não vinculado</span>}
                        </td>
                        <td className="px-3 py-2 text-right">{l.volume}</td>
                        <td className="px-3 py-2 text-right text-success">{l.ganhos}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{l.perdidos}</td>
                        <td className="px-3 py-2 text-right">{Math.round(l.conversao * 100)}%</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          {fmtBRL(l.valor)}
                          {l.ganhosSemValor > 0 && <span className="ml-1 text-warning" title={`${l.ganhosSemValor} ganho(s) sem valor`}>⚠</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{l.mensagens}</td>
                        <td className="px-3 py-2 text-right text-muted-foreground">{l.tarefas}</td>
                        <td className={`px-3 py-2 text-right whitespace-nowrap ${l.semResposta > 0 ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
                          {l.semResposta}{l.comIncoming > 0 && <span className="text-xs text-muted-foreground"> ({Math.round(l.semResposta / l.comIncoming * 100)}%)</span>}
                        </td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">{fmtDur(l.tempoRespSeg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>

            {/* Gráfico */}
            <Card>
              <CardHeader><CardTitle className="text-base">Leads × Ganhos</CardTitle></CardHeader>
              <CardContent>
                <AtendimentoChart dados={linhas.map(l => ({ nome: l.nome, volume: l.volume, ganhos: l.ganhos }))} />
              </CardContent>
            </Card>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* SLA de 1ª resposta */}
            <Card>
              <CardHeader><CardTitle className="text-base">SLA de 1ª resposta <span className="text-xs font-normal text-muted-foreground">· horário comercial</span></CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {[
                  { label: '≤ 5 min', v: sla.sla5, cor: 'bg-success' },
                  { label: '5–15 min', v: sla.sla15, cor: 'bg-success/60' },
                  { label: '15–60 min', v: sla.sla60, cor: 'bg-warning' },
                  { label: '> 60 min', v: sla.slaMais, cor: 'bg-destructive' },
                ].map(b => (
                  <div key={b.label} className="flex items-center gap-2 text-sm">
                    <span className="w-20 text-muted-foreground shrink-0">{b.label}</span>
                    <div className="flex-1 bg-muted rounded h-4 overflow-hidden"><div className={`${b.cor} h-4`} style={{ width: `${pct(b.v)}%` }} /></div>
                    <span className="w-20 text-right shrink-0">{b.v} ({pct(b.v)}%)</span>
                  </div>
                ))}
                <p className="text-xs text-muted-foreground pt-1">{sla.respondidos} respostas medidas.</p>
              </CardContent>
            </Card>

            {/* Motivo de perda */}
            <Card>
              <CardHeader><CardTitle className="text-base">Motivo de perda</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {perdas.total === 0 ? (
                  <p className="text-sm text-muted-foreground">Sem perdas no período.</p>
                ) : (
                  <>
                    {perdas.motivos.map(m => (
                      <div key={m.motivo} className="flex items-center gap-2 text-sm">
                        <span className="flex-1 truncate text-muted-foreground">{m.motivo}</span>
                        <div className="w-24 bg-muted rounded h-4 overflow-hidden"><div className="bg-muted-foreground h-4" style={{ width: `${Math.round(m.qtd / perdas.total * 100)}%` }} /></div>
                        <span className="w-14 text-right shrink-0">{m.qtd}</span>
                      </div>
                    ))}
                    {perdas.semMotivo > 0 && (
                      <div className="bg-warning/10 border border-warning/30 rounded px-3 py-2 text-xs text-warning mt-1 flex items-start gap-1.5">
                        <TriangleAlert size={13} className="mt-0.5 shrink-0" />
                        <span><strong>{Math.round(perdas.semMotivo / perdas.total * 100)}%</strong> dos {perdas.total} leads perdidos estão <strong>sem motivo informado</strong>. Peça ao time para marcar o motivo ao perder — sem isso não dá pra saber por que estão perdendo.</span>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <p className="text-xs text-muted-foreground">
            <strong>Sem resp.</strong> = leads em que o cliente mandou mensagem e nenhum atendente respondeu.{' '}
            <strong>Msgs</strong> = mensagens enviadas pelo colaborador. <strong>1ª resp.</strong> = tempo típico (mediana)
            até a primeira resposta humana, contando só leads que chegam em horário comercial (8h–18h) — respostas
            automáticas do bot e leads de madrugada não entram. Ligações não são registradas no Kommo, então não aparecem.{' '}
            <strong>Cobertura de fechamento</strong> = % dos leads que estão hoje nas etapas &quot;tem interesse&quot; e
            &quot;em negociação&quot; com pelo menos uma tarefa em aberto no Kommo (de qualquer tipo, mesmo vencida).
          </p>
        </>
      )}
    </div>
  )
}
