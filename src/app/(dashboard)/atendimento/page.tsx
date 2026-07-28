import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { getKommoStatus, sincronizarSeNecessario } from '@/lib/kommo'
import { metricasAtendimento } from '@/lib/queries/atendimento'
import { AtendimentoChart } from './components/atendimento-chart'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Headset, RefreshCw, AlertTriangle, TriangleAlert } from 'lucide-react'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm']
const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export default async function AtendimentoPage({ searchParams }: { searchParams: Promise<{ de?: string; ate?: string; sync?: string }> }) {
  const usuario = await getUsuarioLogado()
  if (!GESTORES.includes(usuario.papel)) redirect('/dashboard')

  const params = await searchParams
  const status = await getKommoStatus()

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

  const linhas = status.conectado ? await metricasAtendimento(inicio, fim) : []
  const tot = linhas.reduce((a, l) => ({
    volume: a.volume + l.volume,
    ganhos: a.ganhos + l.ganhos,
    perdidos: a.perdidos + l.perdidos,
    valor: a.valor + l.valor,
    ganhosSemValor: a.ganhosSemValor + l.ganhosSemValor,
  }), { volume: 0, ganhos: 0, perdidos: 0, valor: 0, ganhosSemValor: 0 })
  const convTotal = tot.volume ? Math.round((tot.ganhos / tot.volume) * 100) : 0

  const qsPeriodo = `de=${de}&ate=${ate}`

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><Headset size={22} /> Atendimento</h1>
          <p className="text-slate-500 text-sm">Métricas de atendimento por colaborador (Kommo CRM)</p>
        </div>
        <div className="flex items-center gap-3">
          {ultimaSync && (
            <span className="text-xs text-slate-400">
              Atualizado {format(new Date(ultimaSync), "dd/MM 'às' HH:mm", { locale: ptBR })}
            </span>
          )}
          <Link
            href={`/atendimento?${qsPeriodo}&sync=1`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 h-9 text-sm hover:bg-slate-50"
          >
            <RefreshCw size={14} /> Atualizar agora
          </Link>
        </div>
      </div>

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

      {/* Filtro de período */}
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
      </form>

      {status.conectado && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500 font-medium">Leads atendidos</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{tot.volume.toLocaleString('pt-BR')}</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500 font-medium">Vendas ganhas</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{tot.ganhos}</p><p className="text-xs text-slate-400">{tot.perdidos} perdidas</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500 font-medium">Conversão</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold">{convTotal}%</p></CardContent></Card>
            <Card><CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500 font-medium">Valor ganho</CardTitle></CardHeader><CardContent><p className="text-2xl font-bold text-green-600">{fmtBRL(tot.valor)}</p></CardContent></Card>
          </div>

          {/* Alerta de valor não informado */}
          {tot.ganhosSemValor > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
              <TriangleAlert size={16} className="mt-0.5 shrink-0" />
              <div>
                <p className="font-medium">Valor subestimado — {tot.ganhosSemValor} venda(s) ganha(s) sem valor informado no Kommo.</p>
                <p className="text-xs mt-0.5">O valor ganho acima está abaixo das vendas reais do mês. Peça aos vendedores para preencher o valor do lead no Kommo ao ganhar a venda.</p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Ranking */}
            <Card>
              <CardHeader><CardTitle className="text-base">Ranking por colaborador</CardTitle></CardHeader>
              <CardContent className="p-0">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-y text-slate-500">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Colaborador</th>
                      <th className="text-right px-3 py-2 font-medium">Leads</th>
                      <th className="text-right px-3 py-2 font-medium">Ganhos</th>
                      <th className="text-right px-3 py-2 font-medium">Perdidos</th>
                      <th className="text-right px-3 py-2 font-medium">Conv.</th>
                      <th className="text-right px-4 py-2 font-medium">Valor</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {linhas.map((l, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-4 py-2 font-medium">
                          {l.nome}
                          {!l.vinculado && <span className="ml-1 text-xs text-amber-600" title="Usuário do Kommo sem vínculo com o Mova">·não vinculado</span>}
                        </td>
                        <td className="px-3 py-2 text-right">{l.volume}</td>
                        <td className="px-3 py-2 text-right text-green-700">{l.ganhos}</td>
                        <td className="px-3 py-2 text-right text-slate-500">{l.perdidos}</td>
                        <td className="px-3 py-2 text-right">{Math.round(l.conversao * 100)}%</td>
                        <td className="px-4 py-2 text-right whitespace-nowrap">
                          {fmtBRL(l.valor)}
                          {l.ganhosSemValor > 0 && <span className="ml-1 text-amber-500" title={`${l.ganhosSemValor} ganho(s) sem valor`}>⚠</span>}
                        </td>
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
        </>
      )}
    </div>
  )
}
