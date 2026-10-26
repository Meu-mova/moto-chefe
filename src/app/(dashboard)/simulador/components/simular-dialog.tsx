'use client'
import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Calculator, CreditCard, Link2, Banknote, Building2 } from 'lucide-react'

// Fatores de financiamento (principal × fator / parcelas = valor_parcela)
const FINANCIAMENTO_FATORES: Record<number, number> = {
  12: 1.20,
  24: 1.35,
  36: 1.55,
  48: 1.80,
  60: 2.00,
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

type Modelo = {
  id: string
  nome: string
  precoAvista: string
  precoPix: string
  taxaCartaoFisico: string
  taxaLinkPagamento: string
}

type Props = {
  modelo: Modelo | null
  onClose: () => void
}

export function SimularDialog({ modelo, onClose }: Props) {
  const [entrada, setEntrada] = useState('')
  const [parcelasCartao, setParcelasCartao] = useState('21')

  const calc = useMemo(() => {
    if (!modelo) return null

    const avista = parseFloat(modelo.precoAvista)
    const pix = parseFloat(modelo.precoPix)
    const taxaFisico = parseFloat(modelo.taxaCartaoFisico)
    const taxaLink = parseFloat(modelo.taxaLinkPagamento)
    const ent = parseFloat(entrada || '0')
    const nCartao = parseInt(parcelasCartao)

    if (ent > avista) return null

    const totalFisico = avista * (1 + taxaFisico)
    const financiadoFisico = totalFisico - ent
    const parcelaFisico = financiadoFisico / nCartao

    const totalLink = avista * (1 + taxaLink)
    const financiadoLink = totalLink - ent
    const parcelaLink = financiadoLink / nCartao

    const baseFinanc = avista - ent

    return {
      pix,
      descontoPix: avista - pix,
      totalFisico,
      financiadoFisico,
      parcelaFisico,
      totalLink,
      financiadoLink,
      parcelaLink,
      financiamento: Object.entries(FINANCIAMENTO_FATORES).map(([n, fator]) => {
        const parc = parseInt(n)
        const total = baseFinanc * fator
        return { parcelas: parc, total: total + ent, parcela: total / parc }
      }),
    }
  }, [modelo, entrada, parcelasCartao])

  if (!modelo) return null

  const avista = parseFloat(modelo.precoAvista)
  const entradaNum = parseFloat(entrada || '0')
  const entradaInvalida = entradaNum > avista

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-xl">
            <Calculator size={20} />
            {modelo.nome}
          </DialogTitle>
        </DialogHeader>

        {/* Preços base */}
        <div className="grid grid-cols-2 gap-3">
          <div className="rounded-lg border bg-muted p-3 text-center">
            <p className="text-xs text-muted-foreground uppercase tracking-wide mb-1">À Vista</p>
            <p className="text-lg font-bold text-foreground">{fmt(parseFloat(modelo.precoAvista))}</p>
          </div>
          <div className="rounded-lg border bg-success/10 border-success/30 p-3 text-center">
            <p className="text-xs text-success uppercase tracking-wide mb-1">PIX / Dinheiro</p>
            <p className="text-lg font-bold text-success">{fmt(parseFloat(modelo.precoPix))}</p>
            <p className="text-xs text-success mt-0.5">
              desconto de {fmt(parseFloat(modelo.precoAvista) - parseFloat(modelo.precoPix))}
            </p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label>Entrada (R$)</Label>
            <CurrencyInput value={entrada} onChange={setEntrada} placeholder="0,00" />
            {entradaInvalida && (
              <p className="text-xs text-destructive">Entrada não pode ser maior que o valor à vista</p>
            )}
          </div>
          <div className="space-y-1">
            <Label>Parcelas (Cartão / Link)</Label>
            <Select value={parcelasCartao} onValueChange={v => setParcelasCartao(v ?? '21')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Array.from({ length: 21 }, (_, i) => i + 1).map(n => (
                  <SelectItem key={n} value={String(n)}>{n}x</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {calc && !entradaInvalida && (
          <div className="space-y-3">
            {/* Cartão Físico */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <CreditCard size={16} className="text-info" />
                <p className="font-semibold text-sm">Cartão Físico — {parcelasCartao}x</p>
                <span className="text-xs text-muted-foreground ml-auto">
                  taxa {(parseFloat(modelo.taxaCartaoFisico) * 100).toFixed(2)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Parcela</p>
                  <p className="font-bold text-info">{fmt(calc.parcelaFisico)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Financiado</p>
                  <p className="font-semibold text-foreground">{fmt(calc.financiadoFisico)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold text-foreground">{fmt(calc.totalFisico)}</p>
                </div>
              </div>
              {entradaNum > 0 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Entrada {fmt(entradaNum)} + {parcelasCartao}x {fmt(calc.parcelaFisico)}
                </p>
              )}
            </div>

            {/* Link de Pagamento */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Link2 size={16} className="text-info" />
                <p className="font-semibold text-sm">Link de Pagamento — {parcelasCartao}x</p>
                <span className="text-xs text-muted-foreground ml-auto">
                  taxa {(parseFloat(modelo.taxaLinkPagamento) * 100).toFixed(2)}%
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Parcela</p>
                  <p className="font-bold text-info">{fmt(calc.parcelaLink)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Financiado</p>
                  <p className="font-semibold text-foreground">{fmt(calc.financiadoLink)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold text-foreground">{fmt(calc.totalLink)}</p>
                </div>
              </div>
              {entradaNum > 0 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Entrada {fmt(entradaNum)} + {parcelasCartao}x {fmt(calc.parcelaLink)}
                </p>
              )}
            </div>

            {/* Financiamento */}
            <div className="rounded-lg border p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 size={16} className="text-warning" />
                <p className="font-semibold text-sm">Financiamento</p>
                <span className="text-xs text-muted-foreground ml-auto">sujeito a aprovação de crédito</span>
              </div>
              <div className="divide-y">
                {calc.financiamento.map(({ parcelas, total, parcela }) => (
                  <div key={parcelas} className="py-2 grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-muted-foreground">Prazo</p>
                      <p className="font-semibold text-warning">{parcelas}x</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Parcela</p>
                      <p className="font-bold text-foreground">{fmt(parcela)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-semibold text-foreground">{fmt(total)}</p>
                    </div>
                  </div>
                ))}
              </div>
              {entradaNum > 0 && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Base calculada sobre {fmt(parseFloat(modelo.precoAvista) - entradaNum)} (à vista − entrada)
                </p>
              )}
            </div>
          </div>
        )}

        {entradaInvalida && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-center text-sm text-destructive">
            A entrada não pode ser maior que o valor à vista ({fmt(avista)})
          </div>
        )}

        <div className="flex justify-end">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
