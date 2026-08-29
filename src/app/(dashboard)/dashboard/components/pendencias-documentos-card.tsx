import Link from 'next/link'
import { CheckCircle2, ClipboardList } from 'lucide-react'
import { LABEL_PENDENCIA, type Pendencia } from '@/lib/pendencias-venda'
import type { PainelPendencias } from '@/lib/queries/pendencias-venda'

const ORDEM: Pendencia[] = ['contrato', 'checklist', 'nf', 'conciliacao']

function dataCurta(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function Chip({ tipo }: { tipo: Pendencia }) {
  return (
    <span className="inline-block rounded bg-amber-100 text-amber-800 text-[11px] font-medium px-1.5 py-0.5">
      {LABEL_PENDENCIA[tipo]}
    </span>
  )
}

export function PendenciasDocumentosCard({
  dados,
  modo,
}: {
  dados: PainelPendencias
  modo: 'vendedor' | 'gestao'
}) {
  if (dados.total === 0) return null

  const tudoEmDia = dados.pendentes === 0

  return (
    <section className="bg-white border rounded-lg p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="font-semibold text-sm flex items-center gap-1.5">
            <ClipboardList size={15} className="text-slate-400" />
            Vendas desde {dataCurta(dados.desde)}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Contrato, checklist, NF e conciliação — a venda só conta com as quatro fechadas.
          </p>
        </div>
        <Link href="/vendas" className="text-xs text-slate-500 hover:text-slate-900 underline shrink-0">
          ver em /vendas
        </Link>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 rounded-lg border border-green-200 bg-green-50 px-3 py-2">
          <p className="text-[11px] uppercase tracking-wide text-green-700 font-semibold">Efetivadas</p>
          <p className="text-2xl font-bold text-green-700">{dados.efetivadas}</p>
        </div>
        <div className={`flex-1 rounded-lg border px-3 py-2 ${tudoEmDia ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'}`}>
          <p className={`text-[11px] uppercase tracking-wide font-semibold ${tudoEmDia ? 'text-slate-500' : 'text-amber-700'}`}>
            Pendentes de tarefa
          </p>
          <p className={`text-2xl font-bold ${tudoEmDia ? 'text-slate-400' : 'text-amber-700'}`}>{dados.pendentes}</p>
        </div>
      </div>

      {tudoEmDia ? (
        <p className="text-sm text-green-700 flex items-center gap-1.5">
          <CheckCircle2 size={15} /> Tudo em dia — nenhuma venda pendente de tarefa.
        </p>
      ) : (
        <p className="text-xs text-slate-600">
          {ORDEM.filter(t => dados.porTipo[t] > 0)
            .map(t => `${dados.porTipo[t]} sem ${LABEL_PENDENCIA[t]}`)
            .join(' · ')}
        </p>
      )}

      {modo === 'vendedor' && dados.vendas.length > 0 && (
        <ul className="divide-y border-t pt-1">
          {dados.vendas.map(v => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-1.5 text-sm">
              <span className="truncate">
                <span className="text-slate-400 tabular-nums">#{v.numero}</span>{' '}
                <span className="text-slate-700">{v.clienteNome}</span>
              </span>
              <span className="flex gap-1 shrink-0">
                {v.pendencias.map(p => <Chip key={p} tipo={p} />)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {modo === 'gestao' && dados.porVendedor.length > 0 && (
        <div className="overflow-x-auto border-t pt-2">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-slate-400">
                <th className="font-medium py-1 pr-3">Vendedor</th>
                <th className="font-medium py-1 px-2 text-right">Vendas</th>
                <th className="font-medium py-1 px-2 text-right">Efetivadas</th>
                {ORDEM.map(t => (
                  <th key={t} className="font-medium py-1 px-2 text-right">s/ {LABEL_PENDENCIA[t]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {dados.porVendedor.map(v => {
                const pendentes = v.total - v.efetivadas
                return (
                  <tr key={v.vendedorId} className={pendentes > 0 ? 'bg-amber-50/40' : ''}>
                    <td className="py-1.5 pr-3 font-medium truncate max-w-[14rem]">{v.nome}</td>
                    <td className="py-1.5 px-2 text-right tabular-nums text-slate-600">{v.total}</td>
                    <td className={`py-1.5 px-2 text-right tabular-nums font-semibold ${pendentes > 0 ? 'text-slate-700' : 'text-green-700'}`}>
                      {v.efetivadas}
                    </td>
                    {ORDEM.map(t => (
                      <td key={t} className={`py-1.5 px-2 text-right tabular-nums ${v[t] > 0 ? 'text-amber-700 font-semibold' : 'text-slate-300'}`}>
                        {v[t] || '—'}
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
