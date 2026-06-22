'use client'
import { useState, useMemo } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { criarPrecificacaoAction, editarPrecificacaoAction } from '../actions'

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  taxaPix: string
  taxasCartao: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
  ativo: boolean
}

type Props = {
  modelo?: Modelo | null
  onClose: () => void
}

const PARCELAS_CARTAO = Array.from({ length: 21 }, (_, i) => i + 1)
const PARCELAS_LINK = Array.from({ length: 18 }, (_, i) => i + 1)
const PARCELAS_FINANCIAMENTO = [12, 24, 36, 48]

function toStr(v: number | undefined) {
  if (v === undefined || v === 0) return ''
  return (v * 100).toFixed(4).replace(/\.?0+$/, '')
}

function toDecimal(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n / 100
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type RateMap = Record<string, string>

function initRates(taxas: Record<string, number>, parcelas: number[]): RateMap {
  const m: RateMap = {}
  parcelas.forEach(n => {
    const v = taxas[String(n)]
    m[String(n)] = v !== undefined ? toStr(v) : ''
  })
  return m
}

function TaxaTabela({
  parcelas,
  taxas,
  onChange,
  base,
  cor,
}: {
  parcelas: number[]
  taxas: RateMap
  onChange: (n: number, v: string) => void
  base: number
  cor: string
}) {
  return (
    <div className="rounded-lg border overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium w-16">Parcelas</th>
            <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium w-36">Taxa (%)</th>
            <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Valor Total</th>
            <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Valor da Parcela</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {parcelas.map(n => {
            const taxa = toDecimal(taxas[String(n)] ?? '')
            const total = base > 0 ? base * (1 + taxa) : 0
            const parcela = total / n
            const temTaxa = (taxas[String(n)] ?? '') !== ''
            return (
              <tr key={n} className="hover:bg-slate-50/50">
                <td className="px-3 py-1.5 font-semibold text-slate-700">{n}x</td>
                <td className="px-3 py-1.5">
                  <Input
                    type="number"
                    step="0.0001"
                    min="0"
                    max="200"
                    className="h-7 text-sm w-28"
                    placeholder="0,0000"
                    value={taxas[String(n)] ?? ''}
                    onChange={e => onChange(n, e.target.value)}
                  />
                </td>
                <td className={`px-3 py-1.5 text-right text-sm ${temTaxa && base > 0 ? 'text-slate-800 font-medium' : 'text-slate-300'}`}>
                  {temTaxa && base > 0 ? fmt(total) : '—'}
                </td>
                <td className={`px-3 py-1.5 text-right font-bold ${temTaxa && base > 0 ? cor : 'text-slate-300'}`}>
                  {temTaxa && base > 0 ? fmt(parcela) : '—'}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export function ModeloDialog({ modelo, onClose }: Props) {
  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [valorMinimo, setValorMinimo] = useState(modelo?.valorMinimo ?? '')
  const [taxaPix, setTaxaPix] = useState(modelo ? toStr(parseFloat(modelo.taxaPix)) : '0')
  const [taxasCartao, setTaxasCartao] = useState<RateMap>(() =>
    initRates(modelo?.taxasCartao ?? {}, PARCELAS_CARTAO)
  )
  const [taxasLink, setTaxasLink] = useState<RateMap>(() =>
    initRates(modelo?.taxasLink ?? {}, PARCELAS_LINK)
  )
  const [taxasFinanciamento, setTaxasFinanciamento] = useState<RateMap>(() =>
    initRates(modelo?.taxasFinanciamento ?? {}, PARCELAS_FINANCIAMENTO)
  )
  const [loading, setLoading] = useState(false)

  const base = parseFloat(valorMinimo || '0')
  const taxaPixDecimal = toDecimal(taxaPix)
  const precoPix = base > 0 ? base * (1 + taxaPixDecimal) : 0

  function setCartao(n: number, v: string) {
    setTaxasCartao(prev => ({ ...prev, [String(n)]: v }))
  }
  function setLink(n: number, v: string) {
    setTaxasLink(prev => ({ ...prev, [String(n)]: v }))
  }
  function setFinanciamento(n: number, v: string) {
    setTaxasFinanciamento(prev => ({ ...prev, [String(n)]: v }))
  }

  function buildRateMap(rates: RateMap): Record<string, number> {
    const result: Record<string, number> = {}
    Object.entries(rates).forEach(([k, v]) => {
      if (v !== '' && !isNaN(parseFloat(v))) {
        result[k] = toDecimal(v)
      }
    })
    return result
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !valorMinimo) {
      toast.error('Preencha nome e valor mínimo')
      return
    }
    setLoading(true)
    try {
      const payload = {
        nome,
        valorMinimo,
        taxaPix: String(toDecimal(taxaPix)),
        taxasCartao: buildRateMap(taxasCartao),
        taxasLink: buildRateMap(taxasLink),
        taxasFinanciamento: buildRateMap(taxasFinanciamento),
      }
      if (modelo) {
        await editarPrecificacaoAction(modelo.id, payload)
        toast.success('Modelo atualizado')
      } else {
        await criarPrecificacaoAction(payload)
        toast.success('Modelo criado')
      }
      onClose()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{modelo ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 gap-4">
          {/* Campos base */}
          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-1 space-y-1.5">
              <Label>Nome do Modelo *</Label>
              <Input
                value={nome}
                onChange={e => setNome(e.target.value)}
                placeholder="Ex: JETMAX PRO"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Valor Mínimo de Venda (R$) *</Label>
              <CurrencyInput value={valorMinimo} onChange={setValorMinimo} placeholder="0,00" />
            </div>
            <div className="space-y-1.5">
              <Label>Taxa PIX (%)</Label>
              <Input
                type="number"
                step="0.0001"
                min="-100"
                max="200"
                placeholder="0,0000"
                value={taxaPix}
                onChange={e => setTaxaPix(e.target.value)}
              />
              {base > 0 && (
                <p className="text-xs text-green-600 font-medium">
                  Preço PIX: {fmt(precoPix)}
                </p>
              )}
            </div>
          </div>

          {/* Tabs de parcelamento */}
          <Tabs defaultValue="cartao" className="flex-1 min-h-0 flex flex-col">
            <TabsList>
              <TabsTrigger value="cartao">Cartão de Crédito (1–21x)</TabsTrigger>
              <TabsTrigger value="link">Link de Pagamento (1–18x)</TabsTrigger>
              <TabsTrigger value="financiamento">Financiamento (12/24/36/48)</TabsTrigger>
            </TabsList>

            <TabsContent value="cartao" className="flex-1 overflow-y-auto mt-2">
              <TaxaTabela
                parcelas={PARCELAS_CARTAO}
                taxas={taxasCartao}
                onChange={setCartao}
                base={base}
                cor="text-blue-700"
              />
            </TabsContent>

            <TabsContent value="link" className="flex-1 overflow-y-auto mt-2">
              <TaxaTabela
                parcelas={PARCELAS_LINK}
                taxas={taxasLink}
                onChange={setLink}
                base={base}
                cor="text-purple-700"
              />
            </TabsContent>

            <TabsContent value="financiamento" className="flex-1 overflow-y-auto mt-2">
              <TaxaTabela
                parcelas={PARCELAS_FINANCIAMENTO}
                taxas={taxasFinanciamento}
                onChange={setFinanciamento}
                base={base}
                cor="text-amber-700"
              />
            </TabsContent>
          </Tabs>

          <DialogFooter className="pt-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : modelo ? 'Salvar alterações' : 'Criar modelo'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
