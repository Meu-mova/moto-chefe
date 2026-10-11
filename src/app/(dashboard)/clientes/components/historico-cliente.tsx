'use client'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { buscarHistoricoClienteAction } from '../actions'

type Historico = Awaited<ReturnType<typeof buscarHistoricoClienteAction>>

function moeda(v: unknown) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function data(d: unknown) {
  return d ? new Date(d as string).toLocaleDateString('pt-BR') : '—'
}

/** Vendas e OS do cliente, buscadas só quando a gaveta abre (a lista não carrega histórico de todos). */
export function HistoricoCliente({ clienteId, cpfCnpj }: { clienteId: string; cpfCnpj: string | null }) {
  const [hist, setHist] = useState<Historico | null>(null)
  const [erro, setErro] = useState(false)

  useEffect(() => {
    let vivo = true
    setHist(null)
    setErro(false)
    buscarHistoricoClienteAction(clienteId, cpfCnpj)
      .then(h => { if (vivo) setHist(h) })
      .catch(() => { if (vivo) setErro(true) })
    return () => { vivo = false }
  }, [clienteId, cpfCnpj])

  if (erro) return <p className="text-sm text-muted-foreground">Não foi possível carregar o histórico.</p>
  if (!hist) return <p className="text-sm text-muted-foreground">Carregando…</p>
  if (hist.vendas.length === 0 && hist.os.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma movimentação registrada.</p>
  }

  const item = 'flex items-center gap-2 px-3 py-2 text-sm'
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {hist.vendas.map(v => (
        <div key={v.id} className={item}>
          <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] font-medium text-primary-text">Venda</span>
          <div className="min-w-0 flex-1">
            <p className="truncate">{v.marca} {v.modelo}</p>
            <p className="text-xs text-muted-foreground">#{v.numero} · {data(v.dataVenda)}</p>
          </div>
          <span className="tabular-nums whitespace-nowrap">{moeda(v.valor)}</span>
        </div>
      ))}
      {hist.os.map(o => (
        <Link key={o.id} href={`/ordens-servico/${o.id}`} className={`${item} hover:bg-muted`}>
          <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">OS</span>
          <div className="min-w-0 flex-1">
            <p className="truncate">{o.descricao ?? (o.marca && o.modelo ? `${o.marca} ${o.modelo}` : 'Moto externa')}</p>
            <p className="text-xs text-muted-foreground">{o.numero ? `OS #${o.numero} · ` : ''}{data(o.dataAbertura)}</p>
          </div>
          {o.valorTotal && Number(o.valorTotal) > 0 && (
            <span className="tabular-nums whitespace-nowrap">{moeda(o.valorTotal)}</span>
          )}
        </Link>
      ))}
    </div>
  )
}
