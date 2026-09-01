'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
import { Input } from '@/components/ui/input'
import { CalendarRange, X } from 'lucide-react'

const FORMAS = [
  { value: '',                label: 'Todas as formas' },
  { value: 'pix',             label: 'PIX' },
  { value: 'dinheiro',        label: 'Dinheiro' },
  { value: 'cartao_credito',  label: 'Cartão de Crédito' },
  { value: 'cartao_debito',   label: 'Cartão de Débito' },
  { value: 'link_pagamento',  label: 'Link de Pagamento' },
  { value: 'financiamento',   label: 'Financiamento' },
  { value: 'bonificacao',     label: 'Bonificação' },
]

type Props = {
  lojas: { id: string; nome: string }[]
  vendedores: { id: string; nome: string }[]
  de: string
  ate: string
}

export function VendasPecasFiltros({ lojas, vendedores, de, ate }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()

  const update = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value); else p.delete(key)
    router.replace(`?${p.toString()}`)
  }, [searchParams, router])

  const busca = searchParams.get('q') ?? ''
  const loja = searchParams.get('loja') ?? ''
  const vendedor = searchParams.get('vendedor') ?? ''
  const forma = searchParams.get('forma') ?? ''
  const temFiltro = Boolean(busca || loja || vendedor || forma || searchParams.get('de') || searchParams.get('ate'))

  const selectCls = 'h-8 text-sm border border-slate-200 rounded-md px-2 bg-white'

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Input
        placeholder="Cliente, CNPJ, nº da venda ou peça…"
        defaultValue={busca}
        onChange={e => update('q', e.target.value)}
        className="h-8 text-sm w-64"
      />

      {lojas.length > 1 && (
        <select value={loja} onChange={e => update('loja', e.target.value)} className={`${selectCls} w-40`}>
          <option value="">Todas as lojas</option>
          {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
        </select>
      )}

      <select value={vendedor} onChange={e => update('vendedor', e.target.value)} className={`${selectCls} w-44`}>
        <option value="">Todos os vendedores</option>
        {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
      </select>

      <select value={forma} onChange={e => update('forma', e.target.value)} className={`${selectCls} w-44`}>
        {FORMAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>

      <div className="flex items-center gap-1.5">
        <CalendarRange size={15} className="text-slate-400 shrink-0" />
        {/* O período nunca fica vazio: os cards somam a lista devolvida, e sem
            recorte a soma cresceria até bater no teto de 500 linhas da consulta. */}
        {/* `key` no valor do servidor: sem ele o "Limpar" volta a URL para o mês
            corrente e o campo continua exibindo a data velha. */}
        <Input
          key={`de-${de}`}
          type="date"
          defaultValue={de}
          onChange={e => update('de', e.target.value)}
          className="h-8 text-sm w-36"
        />
        <span className="text-xs text-slate-400">até</span>
        <Input
          key={`ate-${ate}`}
          type="date"
          defaultValue={ate}
          onChange={e => update('ate', e.target.value)}
          className="h-8 text-sm w-36"
        />
      </div>

      {temFiltro && (
        <button
          onClick={() => router.replace('?')}
          className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-md h-8 px-2"
        >
          <X size={13} /> Limpar
        </button>
      )}
    </div>
  )
}
