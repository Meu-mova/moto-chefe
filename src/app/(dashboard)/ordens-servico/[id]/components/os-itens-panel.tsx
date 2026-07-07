'use client'
import { useState, useTransition } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Trash2, Plus, Wrench, Package } from 'lucide-react'
import { adicionarItemOSAction, removerItemOSAction } from '../../actions'
import { toast } from 'sonner'
import type { OSItem } from '@/lib/queries/ordens-servico'

type CatalogoServico = { id: string; nome: string; valor: string; tempoPrevistoMinutos: number | null }
type CatalogoPeca    = { id: string; nome: string; valor: string }

type Props = {
  osId: string
  itens: OSItem[]
  podeEditar: boolean
  servicos: CatalogoServico[]
  pecas: CatalogoPeca[]
}

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function OSItensPanel({ osId, itens, podeEditar, servicos, pecas }: Props) {
  const [pending, start] = useTransition()
  const [tipo, setTipo]  = useState<'servico'|'peca'>('servico')
  const [catalogoId, setCatalogoId] = useState('')
  const [form, setForm]  = useState({ descricao: '', quantidade: '1', valorUnitario: '' })

  function setF(k: keyof typeof form, v: string) { setForm(f => ({ ...f, [k]: v })) }

  function trocarTipo(t: 'servico' | 'peca') {
    setTipo(t)
    setCatalogoId('')
    setForm({ descricao: '', quantidade: '1', valorUnitario: '' })
  }

  function selecionarDoCatalogo(id: string) {
    setCatalogoId(id)
    if (!id) return
    if (tipo === 'servico') {
      const s = servicos.find(s => s.id === id)
      if (s) setForm(f => ({ ...f, descricao: s.nome, valorUnitario: s.valor }))
    } else {
      const p = pecas.find(p => p.id === id)
      if (p) setForm(f => ({ ...f, descricao: p.nome, valorUnitario: p.valor }))
    }
  }

  function adicionar() {
    if (!form.descricao.trim()) { toast.error('Informe a descrição'); return }
    const qty = parseFloat(form.quantidade)
    const val = parseFloat(form.valorUnitario)
    if (!qty || !val) { toast.error('Quantidade e valor devem ser maiores que zero'); return }
    start(async () => {
      try {
        await adicionarItemOSAction(osId, {
          tipo,
          descricao: form.descricao,
          quantidade: qty,
          valorUnitario: val,
          servicoId: tipo === 'servico' ? (catalogoId || null) : null,
          pecaId:    tipo === 'peca'    ? (catalogoId || null) : null,
        })
        setForm({ descricao: '', quantidade: '1', valorUnitario: '' })
        setCatalogoId('')
      } catch (e: any) { toast.error(e.message) }
    })
  }

  function remover(id: string) {
    start(async () => {
      try { await removerItemOSAction(id, osId) }
      catch (e: any) { toast.error(e.message) }
    })
  }

  const servicosItens = itens.filter(i => i.tipo === 'servico')
  const pecasItens     = itens.filter(i => i.tipo === 'peca')

  function ItemRow({ item }: { item: OSItem }) {
    const subtotal = parseFloat(item.quantidade) * parseFloat(item.valorUnitario)
    return (
      <div className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-slate-800">{item.descricao}</p>
          <p className="text-xs text-slate-400">
            {parseFloat(item.quantidade).toLocaleString('pt-BR')} × {fmt(parseFloat(item.valorUnitario))}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm font-semibold text-slate-700">{fmt(subtotal)}</span>
          {podeEditar && (
            <button onClick={() => remover(item.id)} disabled={pending}
              className="text-slate-300 hover:text-red-500 transition-colors disabled:opacity-40">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>
    )
  }

  const opcoesCatalogo = tipo === 'servico' ? servicos : pecas

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Serviços e Peças</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Serviços */}
        {servicosItens.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Wrench size={12} /> Mão de obra
            </p>
            {servicosItens.map(i => <ItemRow key={i.id} item={i} />)}
          </div>
        )}

        {/* Peças */}
        {pecasItens.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <Package size={12} /> Peças
            </p>
            {pecasItens.map(i => <ItemRow key={i.id} item={i} />)}
          </div>
        )}

        {itens.length === 0 && (
          <p className="text-sm text-slate-400 text-center py-4">Nenhum item adicionado ainda.</p>
        )}

        {/* Adicionar item */}
        {podeEditar && (
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Adicionar item</p>

            <div className="flex gap-2">
              {(['servico', 'peca'] as const).map(t => (
                <button key={t} onClick={() => trocarTipo(t)}
                  className={`flex-1 py-1.5 text-xs font-medium rounded-md border transition-colors ${
                    tipo === t
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'border-slate-200 text-slate-600 hover:border-slate-400'
                  }`}>
                  {t === 'servico' ? 'Serviço / Mão de obra' : 'Peça'}
                </button>
              ))}
            </div>

            <select
              value={catalogoId}
              onChange={e => selecionarDoCatalogo(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              <option value="">
                {tipo === 'servico' ? 'Escolher serviço do catálogo (opcional)' : 'Escolher peça do catálogo (opcional)'}
              </option>
              {opcoesCatalogo.map(o => (
                <option key={o.id} value={o.id}>
                  {o.nome} — {fmt(parseFloat(o.valor))}
                </option>
              ))}
            </select>

            <Input placeholder="Descrição" value={form.descricao} onChange={e => setF('descricao', e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="Qtd" type="number" min="0.001" step="0.001"
                value={form.quantidade} onChange={e => setF('quantidade', e.target.value)} />
              <Input placeholder="Valor unit. (R$)" type="number" min="0" step="0.01"
                value={form.valorUnitario} onChange={e => setF('valorUnitario', e.target.value)} />
            </div>
            <Button size="sm" onClick={adicionar} disabled={pending} className="w-full gap-1.5">
              <Plus size={14} /> {pending ? 'Adicionando…' : 'Adicionar'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
