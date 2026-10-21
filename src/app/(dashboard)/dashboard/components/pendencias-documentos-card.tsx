import Link from 'next/link'
import { LinhaPendencia, TituloGrupo } from './requer-atencao'
import { LABEL_PENDENCIA, type Pendencia } from '@/lib/pendencias-venda'
import type { PainelPendencias } from '@/lib/queries/pendencias-venda'

const ORDEM: Pendencia[] = ['contrato', 'checklist', 'nf', 'conciliacao']

function dataCurta(iso: string) {
  const [ano, mes, dia] = iso.split('-')
  return `${dia}/${mes}/${ano}`
}

function Chip({ tipo }: { tipo: Pendencia }) {
  return (
    <span className="inline-block rounded border border-border px-1.5 py-0.5 text-[11px] font-medium text-warning">
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
  const quebra = ORDEM.filter(t => dados.porTipo[t] > 0).map(t => `${dados.porTipo[t]} sem ${LABEL_PENDENCIA[t]}`).join(' · ')

  return (
    <div>
      <TituloGrupo acao={<Link href="/vendas" className="text-xs font-semibold text-primary-text hover:underline">Ver em Vendas</Link>}>
        Vendas desde {dataCurta(dados.desde)} · contrato, checklist, NF e conciliação
      </TituloGrupo>
      <LinhaPendencia rotulo="Pendentes de tarefa" valor={dados.pendentes} href="/vendas" />
      <LinhaPendencia rotulo="Efetivadas (as quatro fechadas)" valor={dados.efetivadas} href="/vendas" />
      <p className="mt-2 text-xs text-muted-foreground">
        {tudoEmDia ? 'Tudo em dia: nenhuma venda pendente de tarefa.' : quebra}
      </p>

      {modo === 'vendedor' && dados.vendas.length > 0 && (
        <ul className="mt-2 divide-y divide-border border-t border-border">
          {dados.vendas.map(v => (
            <li key={v.id} className="flex items-center justify-between gap-3 py-2 text-sm">
              <span className="truncate">
                <span className="tabular-nums text-muted-foreground">#{v.numero}</span>{' '}
                <span className="text-foreground">{v.clienteNome}</span>
              </span>
              <span className="flex shrink-0 gap-1">
                {v.pendencias.map(p => <Chip key={p} tipo={p} />)}
              </span>
            </li>
          ))}
        </ul>
      )}

      {modo === 'gestao' && dados.porVendedor.length > 0 && (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted-foreground">
                <th className="py-2 pr-3 font-semibold">Vendedor</th>
                <th className="px-2 py-2 text-right font-semibold">Vendas</th>
                <th className="px-2 py-2 text-right font-semibold">Efetivadas</th>
                {ORDEM.map(t => (
                  <th key={t} className="px-2 py-2 text-right font-semibold">s/ {LABEL_PENDENCIA[t]}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {dados.porVendedor.map(v => (
                <tr key={v.vendedorId}>
                  <td className="max-w-[14rem] truncate py-2 pr-3 text-foreground">{v.nome}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">{v.total}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-foreground">{v.efetivadas}</td>
                  {ORDEM.map(t => (
                    <td key={t} className={`px-2 py-2 text-right tabular-nums ${v[t] > 0 ? 'font-semibold text-warning' : 'text-muted-foreground'}`}>
                      {v[t] || '—'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
