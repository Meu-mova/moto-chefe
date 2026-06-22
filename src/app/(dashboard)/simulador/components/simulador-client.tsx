'use client'
import { useState, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { GerenciarDialog } from './gerenciar-dialog'
import { excluirSimuladorAction } from '../actions'
import { toast } from 'sonner'
import { Plus, Printer, CreditCard, Link2, Building2, Pencil, Trash2 } from 'lucide-react'

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
  modelos: Modelo[]
  isAdmin: boolean
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function gerarHtmlPrint(modelo: Modelo, entrada: number, parcelasCartao: number, calc: ReturnType<typeof calcular>) {
  if (!calc) return ''
  const data = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const avista = parseFloat(modelo.precoAvista)
  const nomeEsc = esc(modelo.nome)

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Simulação — ${nomeEsc}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 36px; color: #1e293b; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 28px; }
    .brand { font-size: 13px; color: #64748b; margin-bottom: 2px; }
    .model { font-size: 26px; font-weight: 700; }
    .date { font-size: 12px; color: #94a3b8; padding-top: 6px; }
    .prices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
    .price-box { border: 1px solid #e2e8f0; border-radius: 10px; padding: 14px 16px; text-align: center; }
    .price-box.pix { border-color: #bbf7d0; background: #f0fdf4; }
    .price-label { font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 6px; }
    .price-val { font-size: 22px; font-weight: 700; }
    .price-val.green { color: #15803d; }
    .pix-desc { font-size: 11px; color: #16a34a; margin-top: 4px; }
    .entrada-tag { text-align: center; font-size: 13px; color: #475569; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 12px; margin-bottom: 20px; }
    .section { border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; margin-bottom: 12px; }
    .section-title { font-size: 13px; font-weight: 700; margin-bottom: 12px; color: #334155; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; text-align: center; gap: 8px; }
    .cell-label { font-size: 11px; color: #94a3b8; margin-bottom: 3px; }
    .cell-val { font-size: 17px; font-weight: 700; }
    .blue { color: #1d4ed8; }
    .purple { color: #7c3aed; }
    .note { font-size: 11px; color: #94a3b8; text-align: center; margin-top: 10px; }
    hr { border: none; border-top: 1px solid #f1f5f9; margin: 6px 0; }
    .finrow { display: grid; grid-template-columns: 1fr 1fr 1fr; padding: 9px 0; border-bottom: 1px solid #f1f5f9; text-align: center; }
    .finrow:last-child { border-bottom: none; }
    .finrow-head { font-size: 11px; color: #94a3b8; font-weight: 600; }
    .finrow-prazo { font-weight: 700; color: #b45309; }
    .finrow-parc { font-weight: 700; font-size: 15px; }
    .footer { margin-top: 28px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand">MOVA — Gestão em Mobilidade Elétrica</div>
      <div class="model">${nomeEsc}</div>
    </div>
    <div class="date">${data}</div>
  </div>

  <div class="prices">
    <div class="price-box">
      <div class="price-label">À Vista</div>
      <div class="price-val">${fmt(avista)}</div>
    </div>
    <div class="price-box pix">
      <div class="price-label">PIX / Dinheiro</div>
      <div class="price-val green">${fmt(parseFloat(modelo.precoPix))}</div>
      <div class="pix-desc">desconto de ${fmt(avista - parseFloat(modelo.precoPix))}</div>
    </div>
  </div>

  ${entrada > 0 ? `<div class="entrada-tag">Entrada: <strong>${fmt(entrada)}</strong></div>` : ''}

  <div class="section">
    <div class="section-title">💳 Cartão Físico — ${parcelasCartao}x</div>
    <div class="grid3">
      <div><div class="cell-label">Parcela</div><div class="cell-val blue">${fmt(calc.parcelaFisico)}</div></div>
      <div><div class="cell-label">Financiado</div><div class="cell-val">${fmt(calc.financiadoFisico)}</div></div>
      <div><div class="cell-label">Total</div><div class="cell-val">${fmt(calc.totalFisico)}</div></div>
    </div>
    ${entrada > 0 ? `<p class="note">Entrada ${fmt(entrada)} + ${parcelasCartao}x de ${fmt(calc.parcelaFisico)}</p>` : ''}
  </div>

  <div class="section">
    <div class="section-title">🔗 Link de Pagamento — ${parcelasCartao}x</div>
    <div class="grid3">
      <div><div class="cell-label">Parcela</div><div class="cell-val purple">${fmt(calc.parcelaLink)}</div></div>
      <div><div class="cell-label">Financiado</div><div class="cell-val">${fmt(calc.financiadoLink)}</div></div>
      <div><div class="cell-label">Total</div><div class="cell-val">${fmt(calc.totalLink)}</div></div>
    </div>
    ${entrada > 0 ? `<p class="note">Entrada ${fmt(entrada)} + ${parcelasCartao}x de ${fmt(calc.parcelaLink)}</p>` : ''}
  </div>

  <div class="section">
    <div class="section-title">🏦 Financiamento</div>
    <div class="finrow finrow-head">
      <div>Prazo</div><div>Parcela</div><div>Total</div>
    </div>
    ${calc.financiamento.map(({ parcelas, total, parcela }) => `
      <div class="finrow">
        <div class="finrow-prazo">${parcelas}x</div>
        <div class="finrow-parc">${fmt(parcela)}</div>
        <div>${fmt(total)}</div>
      </div>
    `).join('')}
    <p class="note">Sujeito a aprovação de crédito${entrada > 0 ? ` · base sobre ${fmt(avista - entrada)}` : ''}</p>
  </div>

  <div class="footer">Simulação gerada pelo sistema MOVA — valores sujeitos a alteração sem aviso prévio</div>
</body>
</html>`
}

function calcular(modelo: Modelo, entrada: number, parcelasCartao: number) {
  const avista = parseFloat(modelo.precoAvista)
  const pix = parseFloat(modelo.precoPix)
  const taxaFisico = parseFloat(modelo.taxaCartaoFisico)
  const taxaLink = parseFloat(modelo.taxaLinkPagamento)

  if (entrada > avista) return null

  const totalFisico = avista * (1 + taxaFisico)
  const financiadoFisico = totalFisico - entrada
  const parcelaFisico = financiadoFisico / parcelasCartao

  const totalLink = avista * (1 + taxaLink)
  const financiadoLink = totalLink - entrada
  const parcelaLink = financiadoLink / parcelasCartao

  const baseFinanc = avista - entrada

  return {
    pix,
    totalFisico,
    financiadoFisico,
    parcelaFisico,
    totalLink,
    financiadoLink,
    parcelaLink,
    financiamento: Object.entries(FINANCIAMENTO_FATORES).map(([n, fator]) => {
      const parcelas = parseInt(n)
      const total = baseFinanc * fator
      return { parcelas, total: total + entrada, parcela: total / parcelas }
    }),
  }
}

export function SimuladorClient({ modelos, isAdmin }: Props) {
  const [modeloId, setModeloId] = useState<string>('')
  const [entrada, setEntrada] = useState('')
  const [parcelasCartao, setParcelasCartao] = useState('12')
  const [gerenciarAberto, setGerenciarAberto] = useState(false)
  const [modeloEdicao, setModeloEdicao] = useState<Modelo | null>(null)

  const modelo = modelos.find(m => m.id === modeloId) ?? null
  const entradaNum = parseFloat(entrada || '0')
  const entradaInvalida = modelo ? entradaNum > parseFloat(modelo.precoAvista) : false

  const calc = useMemo(() => {
    if (!modelo || entradaInvalida) return null
    return calcular(modelo, entradaNum, parseInt(parcelasCartao))
  }, [modelo, entradaNum, parcelasCartao, entradaInvalida])

  function handlePrint() {
    if (!modelo || !calc) return
    const html = gerarHtmlPrint(modelo, entradaNum, parseInt(parcelasCartao), calc)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'width=750,height=920')
    win?.focus()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  async function handleExcluir(m: Modelo) {
    if (!confirm(`Remover ${m.nome} do simulador?`)) return
    try {
      await excluirSimuladorAction(m.id)
      toast.success('Modelo removido')
      if (modeloId === m.id) setModeloId('')
    } catch {
      toast.error('Erro ao remover')
    }
  }

  return (
    <>
      {/* Seletor de modelo */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-end gap-4">
          <div className="flex-1 space-y-1.5">
            <Label className="text-sm font-medium text-slate-700">Selecione o modelo</Label>
            <Select value={modeloId} onValueChange={v => setModeloId(v ?? '')}>
              <SelectTrigger className="h-11 text-base">
                <SelectValue placeholder="Escolha um modelo para simular..." />
              </SelectTrigger>
              <SelectContent>
                {modelos.map(m => (
                  <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {isAdmin && (
            <div className="flex gap-2 shrink-0">
              {modelo && (
                <>
                  <Button
                    variant="outline" size="sm"
                    onClick={() => { setModeloEdicao(modelo); setGerenciarAberto(true) }}
                    className="gap-1.5"
                  >
                    <Pencil size={14} /> Editar
                  </Button>
                  <Button
                    variant="outline" size="sm"
                    className="text-red-500 hover:text-red-700 hover:border-red-300"
                    onClick={() => handleExcluir(modelo)}
                  >
                    <Trash2 size={14} />
                  </Button>
                </>
              )}
              <Button
                onClick={() => { setModeloEdicao(null); setGerenciarAberto(true) }}
                className="gap-1.5"
              >
                <Plus size={16} /> Novo Modelo
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Simulação */}
      {modelo && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          {/* Cabeçalho do modelo */}
          <div className="px-6 pt-6 pb-4 border-b bg-slate-50">
            <h2 className="text-2xl font-bold text-slate-900">{modelo.nome}</h2>
            <p className="text-sm text-slate-400 mt-0.5">Simulação de condições de pagamento</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Preços base */}
            <div className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border bg-slate-50 p-4 text-center">
                <p className="text-xs text-slate-500 uppercase tracking-wider mb-2">À Vista</p>
                <p className="text-2xl font-bold text-slate-900">{fmt(parseFloat(modelo.precoAvista))}</p>
              </div>
              <div className="rounded-lg border bg-green-50 border-green-200 p-4 text-center">
                <p className="text-xs text-green-600 uppercase tracking-wider mb-2">PIX / Dinheiro</p>
                <p className="text-2xl font-bold text-green-700">{fmt(parseFloat(modelo.precoPix))}</p>
                <p className="text-xs text-green-500 mt-1">
                  desconto de {fmt(parseFloat(modelo.precoAvista) - parseFloat(modelo.precoPix))}
                </p>
              </div>
            </div>

            {/* Inputs de simulação */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Entrada (R$)</Label>
                <CurrencyInput value={entrada} onChange={setEntrada} placeholder="0,00" />
                {entradaInvalida && (
                  <p className="text-xs text-red-500">Entrada maior que o valor à vista</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Parcelas (Cartão / Link)</Label>
                <Select value={parcelasCartao} onValueChange={v => setParcelasCartao(v ?? '12')}>
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

            {calc && (
              <div className="space-y-3">
                {/* Cartão Físico */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CreditCard size={15} className="text-blue-600" />
                    <p className="font-semibold text-sm">Cartão Físico — {parcelasCartao}x</p>
                    <span className="text-xs text-slate-400 ml-auto">
                      taxa {(parseFloat(modelo.taxaCartaoFisico) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Parcela</p>
                      <p className="text-lg font-bold text-blue-700">{fmt(calc.parcelaFisico)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Financiado</p>
                      <p className="text-lg font-semibold text-slate-700">{fmt(calc.financiadoFisico)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Total</p>
                      <p className="text-lg font-semibold text-slate-700">{fmt(calc.totalFisico)}</p>
                    </div>
                  </div>
                  {entradaNum > 0 && (
                    <p className="text-xs text-slate-400 mt-2 text-center">
                      Entrada {fmt(entradaNum)} + {parcelasCartao}x de {fmt(calc.parcelaFisico)}
                    </p>
                  )}
                </div>

                {/* Link de Pagamento */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Link2 size={15} className="text-purple-600" />
                    <p className="font-semibold text-sm">Link de Pagamento — {parcelasCartao}x</p>
                    <span className="text-xs text-slate-400 ml-auto">
                      taxa {(parseFloat(modelo.taxaLinkPagamento) * 100).toFixed(2)}%
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Parcela</p>
                      <p className="text-lg font-bold text-purple-700">{fmt(calc.parcelaLink)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Financiado</p>
                      <p className="text-lg font-semibold text-slate-700">{fmt(calc.financiadoLink)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1">Total</p>
                      <p className="text-lg font-semibold text-slate-700">{fmt(calc.totalLink)}</p>
                    </div>
                  </div>
                  {entradaNum > 0 && (
                    <p className="text-xs text-slate-400 mt-2 text-center">
                      Entrada {fmt(entradaNum)} + {parcelasCartao}x de {fmt(calc.parcelaLink)}
                    </p>
                  )}
                </div>

                {/* Financiamento */}
                <div className="rounded-lg border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Building2 size={15} className="text-amber-600" />
                    <p className="font-semibold text-sm">Financiamento</p>
                    <span className="text-xs text-slate-400 ml-auto">sujeito a aprovação de crédito</span>
                  </div>
                  <div className="grid grid-cols-3 text-center text-xs text-slate-400 font-medium pb-2 border-b">
                    <span>Prazo</span><span>Parcela</span><span>Total</span>
                  </div>
                  <div className="divide-y">
                    {calc.financiamento.map(({ parcelas, total, parcela }) => (
                      <div key={parcelas} className="grid grid-cols-3 gap-2 text-center py-2.5">
                        <p className="font-bold text-amber-700">{parcelas}x</p>
                        <p className="font-bold text-slate-900">{fmt(parcela)}</p>
                        <p className="text-slate-600">{fmt(total)}</p>
                      </div>
                    ))}
                  </div>
                  {entradaNum > 0 && (
                    <p className="text-xs text-slate-400 mt-2 text-center">
                      Base calculada sobre {fmt(parseFloat(modelo.precoAvista) - entradaNum)} (à vista − entrada)
                    </p>
                  )}
                </div>

                {/* Botão de print */}
                <div className="flex justify-end pt-2">
                  <Button onClick={handlePrint} className="gap-2" variant="outline">
                    <Printer size={16} />
                    Imprimir / Salvar PDF
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {!modelo && (
        <div className="rounded-xl border bg-white shadow-sm flex flex-col items-center justify-center py-24 text-slate-400">
          <p className="text-base">Selecione um modelo acima para ver a simulação</p>
        </div>
      )}

      {gerenciarAberto && (
        <GerenciarDialog
          modelo={modeloEdicao}
          onClose={() => { setGerenciarAberto(false); setModeloEdicao(null) }}
        />
      )}
    </>
  )
}
