'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useCallback, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Filter, Search, X } from 'lucide-react'

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

/** Padrão de Vendas: no celular/tablet a busca fica à vista e o resto vai para a gaveta "Filtros". */
export function VendasPecasFiltros({ lojas, vendedores, de, ate }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [gaveta, setGaveta] = useState(false)

  const update = useCallback((key: string, value: string) => {
    const p = new URLSearchParams(searchParams.toString())
    if (value) p.set(key, value); else p.delete(key)
    router.replace(`?${p.toString()}`)
  }, [searchParams, router])

  const busca = searchParams.get('q') ?? ''
  const loja = searchParams.get('loja') ?? ''
  const vendedor = searchParams.get('vendedor') ?? ''
  const forma = searchParams.get('forma') ?? ''
  const temPeriodo = Boolean(searchParams.get('de') || searchParams.get('ate'))
  const ativos = [loja, vendedor, forma].filter(Boolean).length + (temPeriodo ? 1 : 0)
  const temFiltro = Boolean(busca) || ativos > 0
  const limpar = () => router.replace('?')

  // <select> nativo: o Select do base-ui mostra o value cru quando ele não é o rótulo.
  const selectCls = 'h-10 w-full rounded-md border border-input bg-background px-2 text-base lg:h-9 lg:w-44 lg:text-sm'

  const buscaInput = (largura: string) => (
    <div className={`relative ${largura}`}>
      <Search size={14} className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-muted-foreground" />
      <Input
        placeholder="Cliente, CNPJ, nº da venda ou peça…"
        defaultValue={busca}
        onChange={e => update('q', e.target.value)}
        className="h-10 pl-8 md:text-base lg:h-9 lg:text-sm"
      />
    </div>
  )
  const filtroLoja = lojas.length > 1 && (
    <select value={loja} onChange={e => update('loja', e.target.value)} className={selectCls}>
      <option value="">Todas as lojas</option>
      {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
    </select>
  )
  const filtroVendedor = (
    <select value={vendedor} onChange={e => update('vendedor', e.target.value)} className={selectCls}>
      <option value="">Todos os vendedores</option>
      {vendedores.map(v => <option key={v.id} value={v.id}>{v.nome}</option>)}
    </select>
  )
  const filtroForma = (
    <select value={forma} onChange={e => update('forma', e.target.value)} className={selectCls}>
      {FORMAS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
    </select>
  )
  // O período nunca fica vazio: os cards somam a lista devolvida, e sem recorte a soma cresceria
  // até bater no teto de 500 linhas da consulta. `key` no valor do servidor: sem ele o "Limpar"
  // volta a URL para o mês corrente e o campo continua exibindo a data velha.
  const periodo = (
    <div className="flex items-center gap-1.5">
      <Input key={`de-${de}`} type="date" defaultValue={de} onChange={e => update('de', e.target.value)}
        className="h-10 min-w-0 flex-1 md:text-base lg:h-9 lg:w-36 lg:flex-none lg:text-sm" />
      <span className="text-xs text-muted-foreground">até</span>
      <Input key={`ate-${ate}`} type="date" defaultValue={ate} onChange={e => update('ate', e.target.value)}
        className="h-10 min-w-0 flex-1 md:text-base lg:h-9 lg:w-36 lg:flex-none lg:text-sm" />
    </div>
  )

  return (
    <>
      <div className="flex gap-2 lg:hidden">
        {buscaInput('min-w-0 flex-1')}
        <Button type="button" variant="outline" onClick={() => setGaveta(true)} className="h-10 gap-1.5">
          <Filter className="size-4" /> Filtros
          {ativos > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{ativos}</span>}
        </Button>
      </div>

      <Sheet open={gaveta} onOpenChange={setGaveta}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-8">
          <SheetTitle className="mb-3 text-base">Filtros</SheetTitle>
          <div className="space-y-3">
            {filtroLoja}
            {filtroVendedor}
            {filtroForma}
            <div>
              <p className="mb-1 text-sm font-medium">Período</p>
              {periodo}
            </div>
            <div className="flex gap-2 pt-2">
              <Button type="button" variant="outline" onClick={limpar} className="h-11 flex-1 border-input">Limpar</Button>
              <Button type="button" onClick={() => setGaveta(false)} className="h-11 flex-1">Ver vendas</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <div className="hidden flex-wrap items-center gap-2 lg:flex">
        {buscaInput('w-64')}
        {filtroLoja}
        {filtroVendedor}
        {filtroForma}
        {periodo}
        {temFiltro && (
          <Button variant="ghost" size="sm" onClick={limpar} className="gap-1.5 text-muted-foreground hover:text-foreground">
            <X size={13} /> Limpar filtros
          </Button>
        )}
      </div>
    </>
  )
}
