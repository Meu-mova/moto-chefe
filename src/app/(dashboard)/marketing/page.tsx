import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { getKommoStatus, sincronizarSeNecessario } from '@/lib/kommo'
import {
  resumoMarketing, leadsPorCanal, leadsPorFunil, serieEntrada, entradaPorHorario,
  motivosPerdaCoorte, funisNaoClassificados, valoresAtipicos,
  investimentoPorFunil, investimentoPorPlataforma,
} from '@/lib/queries/marketing'
import { calcularCpl, calcularCac, calcularRoas, variacaoPct, periodoAnterior, granularidade } from '@/lib/marketing-canal'
import { EvolucaoChart } from './components/evolucao-chart'
import { HeatmapEntrada } from './components/heatmap-entrada'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { VendasOrigemTab } from './components/vendas-origem-tab'
import { Megaphone, RefreshCw, AlertTriangle, TriangleAlert, ExternalLink, Settings2 } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtBRLc = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmtN = (v: number) => v.toLocaleString('pt-BR')
const fmtPct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`
const ou = (v: number | null, f: (n: number) => string) => (v == null ? '—' : f(v))

// Variação vs. período anterior. Verde/vermelho depende do que é bom em cada
// métrica: CPL e CAC subindo é ruim, o resto subindo é bom.
function Variacao({ v, menorMelhor = false }: { v: number | null; menorMelhor?: boolean }) {
  if (v == null) return <p className="text-xs text-slate-400">sem base anterior</p>
  const bom = menorMelhor ? v < 0 : v > 0
  const cor = v === 0 ? 'text-slate-400' : bom ? 'text-green-600' : 'text-red-600'
  return (
    <p className={`text-xs ${cor}`}>
      {v > 0 ? '▲' : v < 0 ? '▼' : '='} {fmtPct(Math.abs(v))} vs. período anterior
    </p>
  )
}

function Kpi({ titulo, valor, sub, variacao, menorMelhor, destaque }: {
  titulo: string; valor: string; sub?: string
  variacao?: number | null; menorMelhor?: boolean; destaque?: string
}) {
  return (
    <Card>
      <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500 font-medium">{titulo}</CardTitle></CardHeader>
      <CardContent>
        <p className={`text-2xl font-bold ${destaque ?? ''}`}>{valor}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
        {variacao !== undefined && <Variacao v={variacao} menorMelhor={menorMelhor} />}
      </CardContent>
    </Card>
  )
}

export default async function MarketingPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; sync?: string }> }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/marketing')) redirect('/dashboard')

  const params = await searchParams
  const status = await getKommoStatus()
  const grupo = await getGrupoAtivo(usuario)

  const hoje = new Date()
  const p2 = (n: number) => String(n).padStart(2, '0')
  const deDefault = `${hoje.getFullYear()}-${p2(hoje.getMonth() + 1)}-01`
  const ultimoDia = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0)
  const ateDefault = `${ultimoDia.getFullYear()}-${p2(ultimoDia.getMonth() + 1)}-${p2(ultimoDia.getDate())}`
  const de = params.de || deDefault
  const ate = params.ate || ateDefault
  const anterior = periodoAnterior(de, ate)
  const gran = granularidade(de, ate)

  let ultimaSync: Date | null = null
  let erroSync: string | null = null
  if (status.conectado) {
    const r = await sincronizarSeNecessario(params.sync === '1')
    ultimaSync = r.ultima
    erroSync = r.erro
  }

  const [resumo, resumoAnt, canais, funis, serie, horarios, perdas, naoClassificados, atipicos, verbaFunil, verbaFunilAnt, verbaPlataforma] =
    await Promise.all([
      resumoMarketing(grupo.id, de, ate),
      resumoMarketing(grupo.id, anterior.de, anterior.ate),
      leadsPorCanal(grupo.id, de, ate),
      leadsPorFunil(grupo.id, de, ate),
      serieEntrada(grupo.id, de, ate, gran),
      entradaPorHorario(grupo.id, de, ate),
      motivosPerdaCoorte(grupo.id, de, ate),
      // Funil sem grupo pode ser de qualquer Conta: o aviso é para quem classifica (#328).
      usuario.papel === 'admin_geral' ? funisNaoClassificados(de, ate) : Promise.resolve([]),
      valoresAtipicos(grupo.id, de, ate),
      investimentoPorFunil(grupo.id, de, ate),
      investimentoPorFunil(grupo.id, anterior.de, anterior.ate),
      investimentoPorPlataforma(grupo.id, de, ate),
    ])

  const somar = (m: Map<string, number>) => [...m.values()].reduce((a, v) => a + v, 0)
  const verbaTotal = somar(verbaFunil)
  const verbaAnt = somar(verbaFunilAnt)
  const cpl = calcularCpl(verbaTotal, resumo.leads)
  const cac = calcularCac(verbaTotal, resumo.ganhos)
  const roas = calcularRoas(resumo.faturamento, verbaTotal)

  const coberturaCanal = resumo.leads > 0 ? (resumo.leads - resumo.semCanal) / resumo.leads : 1
  const faturamentoLimpo = resumo.faturamento - atipicos.total
  const linkLead = (id: number) => (status.subdominio ? `https://${status.subdominio}.kommo.com/leads/detail/${id}` : null)
  const qsPeriodo = `de=${de}&ate=${ate}`

  // Só canais com lead no período; os demais poluem a tabela.
  const canaisComLead = canais.filter(c => c.leads > 0)
  const semRespTotal = canaisComLead.reduce((a, c) => a + c.semResposta, 0)
  const comIncomingTotal = canaisComLead.reduce((a, c) => a + c.comIncoming, 0)

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Megaphone size={22} /> Marketing — {grupo.nome}</h1>
          <p className="text-slate-500 text-sm">Leads de entrada por canal, conversão e retorno da verba · grupo {grupo.nome}</p>
        </div>
        <div className="flex items-center gap-3">
          {ultimaSync && (
            <span className="text-xs text-slate-400">
              Atualizado {format(new Date(ultimaSync), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </span>
          )}
          <Link href="/admin/canais" className="inline-flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm hover:bg-slate-50">
            <Settings2 size={14} /> Canais e verba
          </Link>
          <Link href={`/marketing?${qsPeriodo}&sync=1`} className="inline-flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm hover:bg-slate-50">
            <RefreshCw size={14} /> Atualizar agora
          </Link>
        </div>
      </div>

      {/* Duas fontes, lado a lado: o lead que entrou (Kommo) e a venda que fechou
          (MOVA). Não se cruzam — casar lead com venda é projeto próprio. */}
      <Tabs defaultValue="leads">
        <TabsList>
          <TabsTrigger value="leads">Leads (Kommo)</TabsTrigger>
          <TabsTrigger value="origem">Vendas por origem</TabsTrigger>
        </TabsList>
        <TabsContent value="origem">
          <VendasOrigemTab grupoId={grupo.id} grupoNome={grupo.nome} de={de} ate={ate} />
        </TabsContent>
        <TabsContent value="leads">
      <div className="space-y-6 pt-4">

      {!status.conectado && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-center gap-2">
          <AlertTriangle size={16} /> Kommo não conectado. Configure em <Link href="/admin/kommo" className="underline font-medium">Admin → Kommo</Link>.
        </div>
      )}
      {erroSync && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <AlertTriangle size={16} /> Falha ao sincronizar com o Kommo: {erroSync} (mostrando os últimos dados em cache)
        </div>
      )}

      <form className="flex items-end gap-3 flex-wrap bg-white border rounded-lg p-4">
        <div className="space-y-1">
          <label className="text-xs text-slate-500 block">De</label>
          <input type="date" name="de" defaultValue={de} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-slate-500 block">Até</label>
          <input type="date" name="ate" defaultValue={ate} className="h-9 rounded-md border px-2 text-sm" />
        </div>
        <button type="submit" className="h-9 px-4 rounded-md bg-slate-900 text-white text-sm">Filtrar</button>
        <p className="text-xs text-slate-400 ml-auto self-center">
          Comparando com {format(new Date(`${anterior.de}T12:00:00`), 'dd/MM')} – {format(new Date(`${anterior.ate}T12:00:00`), 'dd/MM')}
        </p>
      </form>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-4">
        <Kpi titulo="Leads de entrada" valor={fmtN(resumo.leads)} variacao={variacaoPct(resumo.leads, resumoAnt.leads)} />
        <Kpi titulo="Ganhos" valor={fmtN(resumo.ganhos)} sub={`${fmtN(resumo.emAberto)} ainda em aberto`}
             variacao={variacaoPct(resumo.ganhos, resumoAnt.ganhos)} destaque="text-green-600" />
        <Kpi titulo="Conversão" valor={fmtPct(resumo.conversao)} sub="dos leads que entraram"
             variacao={variacaoPct(resumo.conversao, resumoAnt.conversao)} />
        <Kpi titulo="Faturamento" valor={fmtBRL(resumo.faturamento)} sub={`ticket ${fmtBRL(resumo.ticket)}`}
             variacao={variacaoPct(resumo.faturamento, resumoAnt.faturamento)} />
        <Kpi titulo="Verba lançada" valor={fmtBRL(verbaTotal)}
             sub={verbaTotal === 0 ? 'nada lançado no período' : verbaPlataforma.map(p => p.plataforma).join(' + ')}
             variacao={variacaoPct(verbaTotal, verbaAnt)} />
        <Kpi titulo="CPL (custo por lead)" valor={ou(cpl, fmtBRLc)} menorMelhor
             sub={verbaTotal === 0 ? 'lance a verba para calcular' : undefined} />
        <Kpi titulo="ROAS" valor={ou(roas, v => `${v.toFixed(1).replace('.', ',')}×`)}
             sub={cac == null ? undefined : `CAC ${fmtBRL(cac)}`} />
      </div>

      {/* Confiabilidade do número — vem antes de tudo */}
      {resumo.leads > 0 && (
        <Card className={coberturaCanal < 0.8 ? 'border-amber-300' : undefined}>
          <CardHeader className="pb-2"><CardTitle className="text-base">Confiança do relatório</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-52 shrink-0 text-slate-500">Leads com canal identificado</span>
              <div className="flex-1 bg-slate-100 rounded h-4 overflow-hidden max-w-md">
                <div className={coberturaCanal >= 0.8 ? 'bg-green-500 h-4' : 'bg-amber-500 h-4'} style={{ width: `${Math.round(coberturaCanal * 100)}%` }} />
              </div>
              <span className="tabular-nums">{fmtPct(coberturaCanal)}</span>
            </div>
            {resumo.semCanal > 0 && (
              <p className="text-xs text-slate-500">
                {fmtN(resumo.semCanal)} lead(s) sem canal — em geral são cadastrados à mão no Kommo (cliente que
                aparece na loja, indicação, telefone). Aparecem como <strong>Não identificado</strong> e não devem
                ser atribuídos a campanha.
              </p>
            )}
            {resumo.ganhosSemValor > 0 && (
              <p className="text-xs text-amber-700">
                <TriangleAlert size={12} className="inline mb-0.5" /> {resumo.ganhosSemValor} de {resumo.ganhos} ganhos
                estão <strong>sem valor preenchido</strong> no Kommo — o faturamento e o ROAS acima estão subestimados.
              </p>
            )}
            {perdas.total > 0 && perdas.motivos[0]?.motivo === '(não informado)' && (
              <p className="text-xs text-amber-700">
                <TriangleAlert size={12} className="inline mb-0.5" /> {fmtPct(perdas.motivos[0].qtd / perdas.total)} dos
                leads perdidos estão sem motivo informado — sem isso não dá para saber se o lead da campanha era ruim
                ou se faltou atendimento.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Valor atípico distorce faturamento e ROAS */}
      {atipicos.leads.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-800 space-y-1">
          <p className="font-medium flex items-center gap-2">
            <AlertTriangle size={16} /> {atipicos.leads.length} lead(s) ganho(s) com valor fora de escala — provável erro de digitação no Kommo.
          </p>
          <p className="text-xs">
            Sozinhos somam <strong>{fmtBRLc(atipicos.total)}</strong>. Sem eles o faturamento do período seria{' '}
            <strong>{fmtBRLc(faturamentoLimpo)}</strong> — corrija no Kommo para o ROAS acima parar de mentir.
          </p>
          <ul className="text-xs space-y-0.5 pt-1">
            {atipicos.leads.map(l => {
              const href = linkLead(l.leadId)
              return (
                <li key={l.leadId}>
                  {l.nome} — {fmtBRLc(l.valor)}{' '}
                  {href && <a href={href} target="_blank" rel="noopener noreferrer" className="underline inline-flex items-center gap-0.5">abrir <ExternalLink size={10} /></a>}
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Funil sem grupo — lead invisível no relatório */}
      {naoClassificados.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800">
          <p className="font-medium flex items-center gap-2">
            <TriangleAlert size={16} /> {naoClassificados.length} funil(is) sem grupo definido, com{' '}
            {fmtN(naoClassificados.reduce((a, f) => a + f.leads, 0))} lead(s) no período.
          </p>
          <p className="text-xs mt-0.5">
            {naoClassificados.map(f => `${f.funil} (${f.leads})`).join(', ')} — esses leads não entram em nenhum
            grupo. Classifique em <Link href="/admin/canais" className="underline font-medium">Admin → Canais e verba</Link>.
          </p>
        </div>
      )}

      {/* Entrada por canal */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Entrada por canal
            <span className="text-xs font-normal text-slate-400"> · de onde vem o lead</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Canal</th>
                <th className="text-right px-3 py-2 font-medium">Leads</th>
                <th className="text-left  px-3 py-2 font-medium w-32">Participação</th>
                <th className="text-right px-3 py-2 font-medium">Ganhos</th>
                <th className="text-right px-3 py-2 font-medium">Conv.</th>
                <th className="text-right px-3 py-2 font-medium">Ticket</th>
                <th className="text-right px-4 py-2 font-medium">Faturamento</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {canaisComLead.map(c => (
                <tr key={String(c.sourceId)} className="hover:bg-slate-50">
                  <td className="px-4 py-2 font-medium whitespace-nowrap">
                    {c.canal}
                    {c.sourceId != null && !c.plataforma && (
                      <span className="ml-1 text-xs text-amber-600" title="Canal ainda não nomeado">·sem nome</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtN(c.leads)}</td>
                  <td className="px-3 py-2">
                    <div className="bg-slate-100 rounded h-3 overflow-hidden">
                      <div className="bg-indigo-500 h-3" style={{ width: `${Math.round(c.participacao * 100)}%` }} />
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right text-green-700 tabular-nums">{c.ganhos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{fmtPct(c.conversao)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{c.ganhos > 0 ? fmtBRL(c.ticket) : '—'}</td>
                  <td className="px-4 py-2 text-right tabular-nums whitespace-nowrap">{fmtBRL(c.faturamento)}</td>
                </tr>
              ))}
              {canaisComLead.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-slate-400">Sem leads no período.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Entrada por loja/funil, com verba */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            Entrada por loja
            <span className="text-xs font-normal text-slate-400"> · custo e retorno</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-y text-slate-500">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Loja / funil</th>
                <th className="text-right px-3 py-2 font-medium">Leads</th>
                <th className="text-right px-3 py-2 font-medium">Ganhos</th>
                <th className="text-right px-3 py-2 font-medium">Conv.</th>
                <th className="text-right px-3 py-2 font-medium">Faturamento</th>
                <th className="text-right px-3 py-2 font-medium">Verba</th>
                <th className="text-right px-3 py-2 font-medium">CPL</th>
                <th className="text-right px-3 py-2 font-medium">CAC</th>
                <th className="text-right px-4 py-2 font-medium">ROAS</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {funis.map(f => {
                const fCpl = calcularCpl(f.investimento, f.leads)
                const fCac = calcularCac(f.investimento, f.ganhos)
                const fRoas = calcularRoas(f.faturamento, f.investimento)
                return (
                  <tr key={f.pipelineId} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium whitespace-nowrap">{f.funil}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtN(f.leads)}</td>
                    <td className="px-3 py-2 text-right text-green-700 tabular-nums">{f.ganhos}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmtPct(f.conversao)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{fmtBRL(f.faturamento)}</td>
                    <td className="px-3 py-2 text-right tabular-nums whitespace-nowrap">{f.investimento > 0 ? fmtBRL(f.investimento) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{ou(fCpl, fmtBRLc)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{ou(fCac, fmtBRL)}</td>
                    <td className="px-4 py-2 text-right tabular-nums">{ou(fRoas, v => `${v.toFixed(1).replace('.', ',')}×`)}</td>
                  </tr>
                )
              })}
              {funis.length === 0 && (
                <tr><td colSpan={9} className="px-4 py-8 text-center text-slate-400">Sem leads no período.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Evolução da entrada</CardTitle></CardHeader>
          <CardContent><EvolucaoChart dados={serie} gran={gran} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Quando o lead chega</CardTitle></CardHeader>
          <CardContent><HeatmapEntrada dados={horarios} /></CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Desperdício de verba */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Onde a verba vaza
              <span className="text-xs font-normal text-slate-400"> · lead que ninguém respondeu</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {comIncomingTotal === 0 ? (
              <p className="text-sm text-slate-400">Sem dados de conversa no período.</p>
            ) : (
              <>
                <p className="text-sm">
                  <strong className={semRespTotal > 0 ? 'text-red-600' : 'text-green-700'}>{fmtN(semRespTotal)}</strong>{' '}
                  de {fmtN(comIncomingTotal)} leads que mandaram mensagem ficaram <strong>sem nenhuma resposta</strong>{' '}
                  ({fmtPct(semRespTotal / comIncomingTotal)}).
                </p>
                {canaisComLead.filter(c => c.semResposta > 0).slice(0, 8).map(c => (
                  <div key={String(c.sourceId)} className="flex items-center gap-2 text-sm">
                    <span className="flex-1 truncate text-slate-600">{c.canal}</span>
                    <div className="w-24 bg-slate-100 rounded h-3 overflow-hidden">
                      <div className="bg-red-400 h-3" style={{ width: `${Math.round((c.semResposta / Math.max(1, c.comIncoming)) * 100)}%` }} />
                    </div>
                    <span className="w-24 text-right shrink-0 tabular-nums text-xs">
                      {c.semResposta}/{c.comIncoming} ({fmtPct(c.semResposta / Math.max(1, c.comIncoming))})
                    </span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>

        {/* Motivo de perda do lead que entrou */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              Por que o lead do período foi perdido
              <span className="text-xs font-normal text-slate-400"> · qualidade do lead</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {perdas.total === 0 ? (
              <p className="text-sm text-slate-400">Nenhum lead do período foi perdido ainda.</p>
            ) : (
              perdas.motivos.map(m => (
                <div key={m.motivo} className="flex items-center gap-2 text-sm">
                  <span className="flex-1 truncate text-slate-600">{m.motivo}</span>
                  <div className="w-24 bg-slate-100 rounded h-3 overflow-hidden">
                    <div className="bg-slate-400 h-3" style={{ width: `${Math.round((m.qtd / perdas.total) * 100)}%` }} />
                  </div>
                  <span className="w-16 text-right shrink-0 tabular-nums">{m.qtd}</span>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="text-xs text-slate-400 space-y-1">
        <p>
          <strong>Conversão por coorte:</strong> dos leads que <em>entraram</em> no período, quantos já foram ganhos.
          Venda de moto demora, então o mês corrente ainda vai amadurecer — não leia a queda do mês atual como piora.
          Essa conta é diferente da tela de Atendimento, que compara leads criados com vendas fechadas no mesmo período.
        </p>
        <p>
          <strong>CPL, CAC e ROAS</strong> saem por loja, não por plataforma: anúncio click-to-WhatsApp do Meta chega
          no Kommo como WhatsApp, não como Facebook — dividir a verba do Meta pelos leads de Instagram daria número falso.
          Verba lançada por mês é rateada por dia quando o filtro pega mês parcial.
        </p>
        <p>
          <strong>Campanha individual não aparece</strong> porque os campos UTM da conta estão vazios. Para medir campanha
          a campanha é preciso ligar UTM no gerador de leads do Meta (ou a integração de anúncios do Kommo); feito isso,
          esta página passa a mostrar sem retrabalho.
        </p>
      </div>
      </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
