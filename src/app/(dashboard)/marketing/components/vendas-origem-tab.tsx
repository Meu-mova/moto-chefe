import { Fragment } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Settings2, TriangleAlert } from 'lucide-react'
import {
  resumoVendasPorOrigem, vendasPorOrigem, vendasPorOrigemELoja,
  vendasPorOrigemEVendedor, serieVendasPorTipoOrigem, indicacoesPorQuem,
} from '@/lib/queries/marketing'

const fmtBRL = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
const fmtN = (v: number) => v.toLocaleString('pt-BR')
const fmtPct = (v: number) => `${(v * 100).toFixed(1).replace('.', ',')}%`

const NAO_INFORMADO = 'Não informado'

const TIPO_ORDEM = ['Digital', 'Presencial', 'Relacional', 'Parceria', 'Ativo', 'Outro', NAO_INFORMADO]

/** Matriz origem × coluna, com as colunas ordenadas por volume. */
function Matriz({
  titulo,
  dados,
  vazio,
}: {
  titulo: string
  dados: { origem: string; coluna: string; vendas: number }[]
  vazio: string
}) {
  const colunas = [...new Set(dados.map(d => d.coluna))]
    .map(c => ({ nome: c, total: dados.filter(d => d.coluna === c).reduce((a, d) => a + d.vendas, 0) }))
    .sort((a, b) => b.total - a.total)
  const origens = [...new Set(dados.map(d => d.origem))]
    .map(o => ({ nome: o, total: dados.filter(d => d.origem === o).reduce((a, d) => a + d.vendas, 0) }))
    .sort((a, b) => b.total - a.total)
  const valor = (origem: string, coluna: string) =>
    dados.find(d => d.origem === origem && d.coluna === coluna)?.vendas ?? 0

  if (!dados.length) return <p className="text-sm text-slate-500">{vazio}</p>

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-700">{titulo}</p>
      <div className="border rounded-lg bg-white overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500 text-xs">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Origem</th>
              {colunas.map(c => (
                <th key={c.nome} className="text-right px-3 py-2 font-medium whitespace-nowrap">{c.nome}</th>
              ))}
              <th className="text-right px-3 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {origens.map(o => (
              <tr key={o.nome} className="border-t">
                <td className="px-3 py-2">{o.nome}</td>
                {colunas.map(c => {
                  const v = valor(o.nome, c.nome)
                  return (
                    <td key={c.nome} className={`text-right px-3 py-2 ${v === 0 ? 'text-slate-300' : ''}`}>
                      {v === 0 ? '—' : fmtN(v)}
                    </td>
                  )
                })}
                <td className="text-right px-3 py-2 font-semibold">{fmtN(o.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export async function VendasOrigemTab({
  grupoId,
  grupoNome,
  de,
  ate,
}: {
  grupoId: string
  grupoNome: string
  de: string
  ate: string
}) {
  const [resumo, porOrigem, porLoja, porVendedor, serie, indicacoes] = await Promise.all([
    resumoVendasPorOrigem(grupoId, de, ate),
    vendasPorOrigem(grupoId, de, ate),
    vendasPorOrigemELoja(grupoId, de, ate),
    vendasPorOrigemEVendedor(grupoId, de, ate),
    serieVendasPorTipoOrigem(grupoId, de, ate),
    indicacoesPorQuem(grupoId, de, ate),
  ])

  // Subtotal por tipo: é o que permite ler "todo o Digital" mesmo com campanha
  // cadastrada uma a uma no catálogo.
  const informadas = porOrigem.filter(o => o.origem !== NAO_INFORMADO)
  const naoInformada = porOrigem.find(o => o.origem === NAO_INFORMADO)
  const tipos = TIPO_ORDEM
    .map(tipo => ({
      tipo,
      linhas: informadas.filter(o => o.tipo === tipo),
    }))
    .filter(t => t.linhas.length > 0)

  const meses = [...new Set(serie.map(s => s.mes))].sort()
  const tiposSerie = [...new Set(serie.map(s => s.tipo))]

  return (
    <div className="space-y-6 pt-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className={resumo.cobertura < 0.9 ? 'border-amber-300' : ''}>
          <CardHeader className="pb-1">
            <CardTitle className="text-xs text-slate-500 font-medium">Cobertura da origem</CardTitle>
          </CardHeader>
          <CardContent>
            <p className={`text-2xl font-bold ${resumo.cobertura < 0.9 ? 'text-amber-600' : ''}`}>
              {fmtPct(resumo.cobertura)}
            </p>
            <p className="text-xs text-slate-400">
              {fmtN(resumo.comOrigem)} de {fmtN(resumo.vendas)} vendas com origem apontada
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500 font-medium">Vendas no período</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtN(resumo.vendas)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500 font-medium">Faturamento</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold">{fmtBRL(resumo.faturamento)}</p></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500 font-medium">Sem origem</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold">{fmtN(resumo.semOrigem)}</p>
            <p className="text-xs text-slate-400">venda anterior ao campo, ou corrigível na edição</p>
          </CardContent>
        </Card>
      </div>

      {resumo.cobertura < 1 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-sm text-amber-800 flex items-start gap-2">
          <TriangleAlert size={16} className="mt-0.5 shrink-0" />
          <span>
            {resumo.semOrigem === resumo.vendas
              ? 'Nenhuma venda do período tem origem apontada — o campo passa a ser obrigatório nas vendas novas, e as antigas podem ser corrigidas na edição da venda.'
              : `${fmtN(resumo.semOrigem)} venda(s) sem origem entram como "${NAO_INFORMADO}" e ficam fora da comparação entre canais.`}
          </span>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <p className="text-sm font-semibold text-slate-700">Vendas por origem — {grupoNome}</p>
          <Link href="/admin/origens" className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700">
            <Settings2 size={13} /> Editar catálogo de origens
          </Link>
        </div>
        <div className="border rounded-lg bg-white overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Origem</th>
                <th className="text-right px-3 py-2 font-medium">Vendas</th>
                <th className="text-right px-3 py-2 font-medium">Faturamento</th>
                <th className="text-right px-3 py-2 font-medium">Ticket médio</th>
              </tr>
            </thead>
            <tbody>
              {tipos.map(({ tipo, linhas }) => {
                const totalVendas = linhas.reduce((a, l) => a + l.vendas, 0)
                const totalFat = linhas.reduce((a, l) => a + l.faturamento, 0)
                return (
                  <Fragment key={tipo}>
                    {linhas.map(l => (
                      <tr key={l.origem} className="border-t">
                        <td className="px-3 py-2">{l.origem}</td>
                        <td className="text-right px-3 py-2">{fmtN(l.vendas)}</td>
                        <td className="text-right px-3 py-2">{fmtBRL(l.faturamento)}</td>
                        <td className="text-right px-3 py-2 text-slate-500">{fmtBRL(l.ticket)}</td>
                      </tr>
                    ))}
                    <tr key={`sub-${tipo}`} className="border-t bg-slate-50/70 text-xs text-slate-600">
                      <td className="px-3 py-1.5 font-semibold">Subtotal {tipo}</td>
                      <td className="text-right px-3 py-1.5 font-semibold">{fmtN(totalVendas)}</td>
                      <td className="text-right px-3 py-1.5 font-semibold">{fmtBRL(totalFat)}</td>
                      <td className="text-right px-3 py-1.5" />
                    </tr>
                  </Fragment>
                )
              })}
              {naoInformada && (
                <tr className="border-t border-slate-300 bg-slate-50 text-slate-500">
                  <td className="px-3 py-2 italic">{NAO_INFORMADO}</td>
                  <td className="text-right px-3 py-2">{fmtN(naoInformada.vendas)}</td>
                  <td className="text-right px-3 py-2">{fmtBRL(naoInformada.faturamento)}</td>
                  <td className="text-right px-3 py-2">{fmtBRL(naoInformada.ticket)}</td>
                </tr>
              )}
              {porOrigem.length === 0 && (
                <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">Nenhuma venda no período.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {meses.length > 1 && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-700">Evolução por tipo de origem</p>
          <div className="border rounded-lg bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Tipo</th>
                  {meses.map(m => <th key={m} className="text-right px-3 py-2 font-medium">{m}</th>)}
                </tr>
              </thead>
              <tbody>
                {tiposSerie.map(tipo => (
                  <tr key={tipo} className="border-t">
                    <td className="px-3 py-2">{tipo}</td>
                    {meses.map(m => {
                      const p = serie.find(s => s.mes === m && s.tipo === tipo)
                      return (
                        <td key={m} className={`text-right px-3 py-2 ${p ? '' : 'text-slate-300'}`}>
                          {p ? fmtN(p.vendas) : '—'}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Matriz titulo="Origem × loja" dados={porLoja} vazio="Sem vendas no período." />
      <Matriz titulo="Origem × vendedor" dados={porVendedor} vazio="Sem vendas no período." />

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-700">Quem indicou / qual ação</p>
        {indicacoes.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum detalhe preenchido no período. O detalhe é obrigatório nas origens marcadas
            como &quot;exigir detalhe&quot; em Admin → Origens da venda.
          </p>
        ) : (
          <div className="border rounded-lg bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Detalhe</th>
                  <th className="text-right px-3 py-2 font-medium">Vendas</th>
                  <th className="text-right px-3 py-2 font-medium">Faturamento</th>
                </tr>
              </thead>
              <tbody>
                {indicacoes.map(i => (
                  <tr key={i.detalhe} className="border-t">
                    <td className="px-3 py-2">{i.detalhe}</td>
                    <td className="text-right px-3 py-2">{fmtN(i.vendas)}</td>
                    <td className="text-right px-3 py-2">{fmtBRL(i.faturamento)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 space-y-2 border-t pt-4">
        <p>
          <strong>De onde vem este número:</strong> da venda fechada no MOVA, com a origem que o
          vendedor apontou — não do Kommo. É por isso que o faturamento aqui bate com o Financeiro,
          enquanto o da aba de leads é o valor digitado no CRM.
        </p>
        <p>
          Venda anterior ao campo entra como &quot;{NAO_INFORMADO}&quot;. Não houve backfill de
          propósito: inventar origem para venda passada produziria número de marketing falso.
        </p>
      </div>
    </div>
  )
}
