'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { salvarTaxasAction } from '../actions'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Save } from 'lucide-react'

const PARCELAS_CARTAO = Array.from({ length: 21 }, (_, i) => i + 1)
const PARCELAS_DEBITO = [1]
const PARCELAS_LINK = Array.from({ length: 18 }, (_, i) => i + 1)
const PARCELAS_FINANCIAMENTO = [12, 24, 36, 48]

type Taxas = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
  freteValorKm: string
  freteKmGratis: number
  imposto: string
}

type RateMap = Record<string, string>

function toStr(v: number | undefined): string {
  if (!v) return ''
  return (v * 100).toFixed(4).replace(/\.?0+$/, '')
}

function toDecimal(s: string): number {
  const n = parseFloat(s)
  return isNaN(n) ? 0 : n / 100
}

function initMap(taxas: Record<string, number>, parcelas: number[]): RateMap {
  const m: RateMap = {}
  parcelas.forEach(n => {
    m[String(n)] = toStr(taxas[String(n)])
  })
  return m
}

function buildDecimalMap(rates: RateMap): Record<string, number> {
  const result: Record<string, number> = {}
  Object.entries(rates).forEach(([k, v]) => {
    if (v !== '') result[k] = toDecimal(v)
  })
  return result
}

function TaxaGrid({
  parcelas,
  rates,
  onChange,
}: {
  parcelas: number[]
  rates: RateMap
  onChange: (n: number, v: string) => void
}) {
  // Layout em colunas para compactar (especialmente cartão com 21 itens)
  const cols = parcelas.length > 12 ? 3 : parcelas.length > 4 ? 2 : 1
  const perCol = Math.ceil(parcelas.length / cols)
  const chunks = Array.from({ length: cols }, (_, i) =>
    parcelas.slice(i * perCol, (i + 1) * perCol)
  )

  return (
    <div className={`grid gap-4 ${cols === 3 ? 'grid-cols-3' : cols === 2 ? 'grid-cols-2' : 'grid-cols-1 max-w-xs'}`}>
      {chunks.map((chunk, ci) => (
        <div key={ci} className="rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b">
              <tr>
                <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Parcelas</th>
                <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Taxa (%)</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {chunk.map(n => (
                <tr key={n} className="hover:bg-slate-50/50">
                  <td className="px-3 py-1.5 font-semibold text-slate-700 w-16">{n}x</td>
                  <td className="px-3 py-1.5">
                    <Input
                      type="number"
                      step="0.0001"
                      min="0"
                      max="500"
                      className="h-7 text-sm w-28"
                      placeholder="0,0000"
                      value={rates[String(n)] ?? ''}
                      onChange={e => onChange(n, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  )
}

export function TaxasForm({ taxas }: { taxas: Taxas }) {
  const [cartao, setCartao] = useState<RateMap>(() => initMap(taxas.taxasCartao, PARCELAS_CARTAO))
  const [debito, setDebito] = useState<RateMap>(() => initMap(taxas.taxasDebito, PARCELAS_DEBITO))
  const [link, setLink] = useState<RateMap>(() => initMap(taxas.taxasLink, PARCELAS_LINK))
  const [financiamento, setFinanciamento] = useState<RateMap>(() => initMap(taxas.taxasFinanciamento, PARCELAS_FINANCIAMENTO))
  const [freteValorKm, setFreteValorKm] = useState(taxas.freteValorKm)
  const [freteKmGratis, setFreteKmGratis] = useState(String(taxas.freteKmGratis))
  const [imposto, setImposto] = useState(toStr(Number(taxas.imposto)))
  const [loading, setLoading] = useState(false)

  function setCartaoRate(n: number, v: string) { setCartao(prev => ({ ...prev, [String(n)]: v })) }
  function setDebitoRate(n: number, v: string) { setDebito(prev => ({ ...prev, [String(n)]: v })) }
  function setLinkRate(n: number, v: string) { setLink(prev => ({ ...prev, [String(n)]: v })) }
  function setFinancRate(n: number, v: string) { setFinanciamento(prev => ({ ...prev, [String(n)]: v })) }

  async function handleSave() {
    setLoading(true)
    try {
      await salvarTaxasAction({
        taxasCartao: buildDecimalMap(cartao),
        taxasDebito: buildDecimalMap(debito),
        taxasLink: buildDecimalMap(link),
        taxasFinanciamento: buildDecimalMap(financiamento),
        freteValorKm: freteValorKm || '3.00',
        freteKmGratis: parseInt(freteKmGratis, 10) || 40,
        imposto: String(toDecimal(imposto || '6')),
      })
      toast.success('Taxas salvas com sucesso')
    } catch {
      toast.error('Erro ao salvar taxas')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-slate-900">Configuração de Taxas Globais</h2>
          <p className="text-xs text-slate-400 mt-0.5">Aplicadas sobre o valor mínimo de cada modelo</p>
        </div>
        <Button onClick={handleSave} disabled={loading} className="gap-2">
          <Save size={15} />
          {loading ? 'Salvando...' : 'Salvar taxas'}
        </Button>
      </div>

      <div className="p-6">
        <Tabs defaultValue="cartao">
          <TabsList>
            <TabsTrigger value="cartao">Cartão de Crédito (1–21x)</TabsTrigger>
            <TabsTrigger value="debito">Cartão de Débito</TabsTrigger>
            <TabsTrigger value="link">Link de Pagamento (1–18x)</TabsTrigger>
            <TabsTrigger value="financiamento">Financiamento</TabsTrigger>
            <TabsTrigger value="frete">Frete</TabsTrigger>
            <TabsTrigger value="imposto">Imposto</TabsTrigger>
          </TabsList>

          <TabsContent value="cartao" className="mt-4">
            <TaxaGrid parcelas={PARCELAS_CARTAO} rates={cartao} onChange={setCartaoRate} />
          </TabsContent>

          <TabsContent value="debito" className="mt-4">
            <div className="max-w-xs">
              <p className="text-xs text-slate-400 mb-3">Taxa aplicada em transações à vista no cartão de débito.</p>
              <TaxaGrid parcelas={PARCELAS_DEBITO} rates={debito} onChange={setDebitoRate} />
            </div>
          </TabsContent>

          <TabsContent value="link" className="mt-4">
            <TaxaGrid parcelas={PARCELAS_LINK} rates={link} onChange={setLinkRate} />
          </TabsContent>

          <TabsContent value="financiamento" className="mt-4">
            <TaxaGrid parcelas={PARCELAS_FINANCIAMENTO} rates={financiamento} onChange={setFinancRate} />
          </TabsContent>

          <TabsContent value="frete" className="mt-4">
            <div className="max-w-xs space-y-4">
              <p className="text-xs text-slate-400">
                Usado na simulação de frete de entrega (Simulador), calculado sobre a distância ida e volta entre a loja e o CEP de destino.
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Valor por km (R$)</Label>
                <CurrencyInput value={freteValorKm} onChange={setFreteValorKm} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Km grátis (ida e volta)</Label>
                <Input
                  type="number"
                  min="0"
                  step="1"
                  className="h-9 text-sm"
                  value={freteKmGratis}
                  onChange={e => setFreteKmGratis(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="imposto" className="mt-4">
            <div className="max-w-xs space-y-4">
              <p className="text-xs text-slate-400">
                Aplicado sobre o valor bruto de todas as vendas de motos no cálculo do Lucro Líquido (Financeiro).
              </p>
              <div className="space-y-1.5">
                <Label className="text-xs">Imposto (%)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min="0"
                  max="100"
                  className="h-9 text-sm"
                  placeholder="6,00"
                  value={imposto}
                  onChange={e => setImposto(e.target.value)}
                />
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
