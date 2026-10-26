'use client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X, Plus } from 'lucide-react'
import type { TaxasVenda } from '@/lib/preco-minimo'

// Linhas de forma de pagamento — usadas tanto na venda quanto na entrada da
// reserva. Vive aqui porque o vender-button já passava de mil linhas.

export type Pgto = { id: string; tipo: string; valor: string; operadora?: string; parcelas?: string; autorizacao?: string }

export const FORMAS = [
  { value: 'pix', label: 'PIX' },
  { value: 'dinheiro', label: 'Dinheiro' },
  { value: 'cartao_credito', label: 'Cartão de Crédito' },
  { value: 'cartao_debito', label: 'Cartão de Débito' },
  { value: 'financiamento', label: 'Financiamento' },
  { value: 'link_pagamento', label: 'Link de Pagamento' },
  { value: 'transferencia', label: 'Transferência Bancária' },
]

export const OPERADORAS = [
  { value: 'infinitypay', label: 'InfinityPay' },
  { value: 'stone', label: 'Stone' },
  { value: 'pagueveloz', label: 'PagueVeloz' },
]

// Tipos com taxa aplicada sobre parcelas
export const TIPOS_COM_PARCELAS = new Set(['cartao_credito', 'link_pagamento', 'financiamento'])

export function parcelasDisponiveis(tipo: string, taxas: TaxasVenda | null): number[] {
  if (!taxas) return []
  if (tipo === 'cartao_credito') {
    return Array.from({ length: 21 }, (_, i) => i + 1)
  }
  if (tipo === 'link_pagamento') {
    return Object.entries(taxas.taxasLink)
      .filter(([, t]) => t > 0)
      .map(([k]) => parseInt(k))
      .sort((a, b) => a - b)
  }
  if (tipo === 'financiamento') {
    return Object.entries(taxas.taxasFinanciamento)
      .filter(([, t]) => t > 0)
      .map(([k]) => parseInt(k))
      .sort((a, b) => a - b)
  }
  return []
}

/** Linha incompleta = trava o submit. Mesma regra na venda e na reserva. */
export function pgtoIncompleto(p: Pgto, taxasVenda: TaxasVenda | null): boolean {
  if (p.tipo === 'cartao_credito') return !p.operadora || !p.parcelas
  return TIPOS_COM_PARCELAS.has(p.tipo)
    && !!taxasVenda
    && parcelasDisponiveis(p.tipo, taxasVenda).length > 0
    && !p.parcelas
}

type Props = {
  pgtos: Pgto[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, campo: keyof Pgto, valor: string) => void
  taxasVenda: TaxasVenda | null
  /** Campo de autorização do comprovante — só na venda. */
  comAutorizacao?: boolean
  /** Rótulo acima de uma linha específica (ex.: "Entrada recebida"). */
  rotulo?: (idx: number) => string | null
}

export function PagamentosFields({ pgtos, onAdd, onRemove, onUpdate, taxasVenda, comAutorizacao = false, rotulo }: Props) {
  return (
    <>
      {pgtos.map((p, idx) => {
        const opcParcelas = taxasVenda ? parcelasDisponiveis(p.tipo, taxasVenda) : []
        const precisaParcelas = TIPOS_COM_PARCELAS.has(p.tipo) && opcParcelas.length > 0
        const titulo = rotulo?.(idx)
        return (
          <div key={p.id} className="space-y-1.5 rounded-lg border border-border bg-muted/50 p-3">
            {titulo && <p className="text-xs text-muted-foreground font-semibold mb-2">{titulo}</p>}
            <div className="flex gap-2 items-center">
              <Select value={p.tipo} onValueChange={v => onUpdate(p.id, 'tipo', v ?? '')}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Forma de pagamento" />
                </SelectTrigger>
                <SelectContent>
                  {FORMAS.map(f => (
                    <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <CurrencyInput
                className="w-32"
                placeholder="0,00"
                value={p.valor}
                onChange={v => onUpdate(p.id, 'valor', v)}
              />
              {pgtos.length > 1 && (
                <Button type="button" variant="ghost" size="icon" className="shrink-0" onClick={() => onRemove(p.id)}>
                  <X size={14} />
                </Button>
              )}
            </div>

            {p.tipo === 'cartao_credito' && (
              <div className="flex gap-2">
                <Select value={p.operadora ?? ''} onValueChange={v => onUpdate(p.id, 'operadora', v ?? '')}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Operadora" />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERADORAS.map(o => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={p.parcelas ?? ''} onValueChange={v => onUpdate(p.id, 'parcelas', v ?? '')}>
                  <SelectTrigger className="w-28">
                    <SelectValue placeholder="Parcelas" />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 21 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>{i + 1}x</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {comAutorizacao && (p.tipo === 'cartao_credito' || p.tipo === 'cartao_debito') && (
              <Input
                placeholder="Autorização (comprovante) — opcional"
                value={p.autorizacao ?? ''}
                onChange={e => onUpdate(p.id, 'autorizacao', e.target.value.toUpperCase())}
                className="font-mono text-sm"
              />
            )}

            {precisaParcelas && p.tipo !== 'cartao_credito' && (
              <Select value={p.parcelas ?? ''} onValueChange={v => onUpdate(p.id, 'parcelas', v ?? '')}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder={p.tipo === 'financiamento' ? 'Prazo (meses)' : 'Parcelas'} />
                </SelectTrigger>
                <SelectContent>
                  {opcParcelas.map(n => (
                    <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        )
      })}
      <Button type="button" variant="outline" size="sm" className="gap-1 w-full" onClick={onAdd}>
        <Plus size={14} /> Adicionar forma de pagamento
      </Button>
    </>
  )
}
