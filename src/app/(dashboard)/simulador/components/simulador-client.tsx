'use client'
import { useState, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { CreditCard, Link2, Building2, Printer } from 'lucide-react'

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  taxaPix: string
  taxasCartao: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

type Props = { modelos: Modelo[] }

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function calcularLinhas(
  taxas: Record<string, number>,
  base: number,
  entrada: number
) {
  return Object.entries(taxas)
    .filter(([, taxa]) => taxa > 0)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([n, taxa]) => {
      const parcelas = parseInt(n)
      const total = base * (1 + taxa)
      const financiado = total - entrada
      const parcela = financiado / parcelas
      return { parcelas, total, financiado, parcela, taxa }
    })
    .filter(r => r.financiado > 0)
}

function TabelaOpcoes({
  linhas,
  cor,
  entrada,
}: {
  linhas: ReturnType<typeof calcularLinhas>
  cor: string
  entrada: number
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-slate-400 py-4 text-center">Nenhuma opção configurada</p>
  }
  return (
    <div className="overflow-hidden rounded-lg border">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Parcelas</th>
            <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Valor Total</th>
            {entrada > 0 && (
              <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Financiado</th>
            )}
            <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Parcela</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {linhas.map(({ parcelas, total, financiado, parcela }) => (
            <tr key={parcelas} className="hover:bg-slate-50/50">
              <td className="px-3 py-2 font-semibold text-slate-700">{parcelas}x</td>
              <td className="px-3 py-2 text-right text-slate-600">{fmt(total)}</td>
              {entrada > 0 && (
                <td className="px-3 py-2 text-right text-slate-500 text-xs">{fmt(financiado)}</td>
              )}
              <td className={`px-3 py-2 text-right font-bold ${cor}`}>{fmt(parcela)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function gerarHtmlPrint(
  modelo: Modelo,
  entrada: number,
  linhasCartao: ReturnType<typeof calcularLinhas>,
  linhasLink: ReturnType<typeof calcularLinhas>,
  linhasFinanciamento: ReturnType<typeof calcularLinhas>,
  pixPreco: number
) {
  const data = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const nomeEsc = esc(modelo.nome)

  function tabelaHtml(linhas: ReturnType<typeof calcularLinhas>, cor: string, showFinanciado: boolean) {
    if (linhas.length === 0) return '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:8px">Nenhuma opção configurada</p>'
    return `
      <table style="width:100%;border-collapse:collapse;font-size:13px">
        <thead>
          <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
            <th style="text-align:left;padding:7px 10px;color:#64748b;font-size:11px">Parcelas</th>
            <th style="text-align:right;padding:7px 10px;color:#64748b;font-size:11px">Valor Total</th>
            ${showFinanciado && entrada > 0 ? '<th style="text-align:right;padding:7px 10px;color:#64748b;font-size:11px">Financiado</th>' : ''}
            <th style="text-align:right;padding:7px 10px;color:#64748b;font-size:11px">Parcela</th>
          </tr>
        </thead>
        <tbody>
          ${linhas.map(({ parcelas, total, financiado, parcela }) => `
            <tr style="border-bottom:1px solid #f1f5f9">
              <td style="padding:8px 10px;font-weight:700;color:#334155">${parcelas}x</td>
              <td style="padding:8px 10px;text-align:right;color:#475569">${fmt(total)}</td>
              ${showFinanciado && entrada > 0 ? `<td style="padding:8px 10px;text-align:right;color:#94a3b8;font-size:12px">${fmt(financiado)}</td>` : ''}
              <td style="padding:8px 10px;text-align:right;font-weight:700;color:${cor}">${fmt(parcela)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>`
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Simulação — ${nomeEsc}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; padding: 32px; color: #1e293b; font-size: 14px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 2px solid #e2e8f0; }
    .brand { font-size: 12px; color: #94a3b8; margin-bottom: 4px; }
    .model { font-size: 24px; font-weight: 700; }
    .date { font-size: 12px; color: #94a3b8; }
    .pix-box { background:#f0fdf4; border:1px solid #bbf7d0; border-radius:10px; padding:14px 20px; text-align:center; margin-bottom:20px; }
    .pix-label { font-size:11px; color:#16a34a; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }
    .pix-val { font-size:28px; font-weight:700; color:#15803d; }
    .pix-base { font-size:12px; color:#64748b; margin-top:4px; }
    .entrada-tag { text-align:center; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:8px; margin-bottom:20px; font-size:13px; color:#475569; }
    .section { margin-bottom:20px; }
    .section-title { font-size:13px; font-weight:700; color:#334155; margin-bottom:10px; display:flex; align-items:center; gap:6px; }
    .section-box { border:1px solid #e2e8f0; border-radius:10px; overflow:hidden; }
    .footer { margin-top:24px; padding-top:12px; border-top:1px solid #e2e8f0; font-size:11px; color:#94a3b8; text-align:center; }
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

  <div class="pix-box">
    <div class="pix-label">PIX / Dinheiro (melhor preço)</div>
    <div class="pix-val">${fmt(pixPreco)}</div>
    <div class="pix-base">Valor mínimo de venda: ${fmt(parseFloat(modelo.valorMinimo))}</div>
  </div>

  ${entrada > 0 ? `<div class="entrada-tag">Entrada: <strong>${fmt(entrada)}</strong></div>` : ''}

  <div class="section">
    <div class="section-title">💳 Cartão de Crédito</div>
    <div class="section-box">${tabelaHtml(linhasCartao, '#1d4ed8', true)}</div>
  </div>

  <div class="section">
    <div class="section-title">🔗 Link de Pagamento</div>
    <div class="section-box">${tabelaHtml(linhasLink, '#7c3aed', true)}</div>
  </div>

  <div class="section">
    <div class="section-title">🏦 Financiamento</div>
    <div class="section-box">${tabelaHtml(linhasFinanciamento, '#b45309', true)}</div>
  </div>

  <div class="footer">MOVA — Simulação gerada em ${data} · Valores sujeitos a alteração sem aviso prévio · Sujeito à aprovação de crédito</div>
</body>
</html>`
}

export function SimuladorClient({ modelos }: Props) {
  const [modeloId, setModeloId] = useState<string>('')
  const [entrada, setEntrada] = useState('')

  const modelo = modelos.find(m => m.id === modeloId) ?? null
  const base = modelo ? parseFloat(modelo.valorMinimo) : 0
  const taxaPix = modelo ? parseFloat(modelo.taxaPix) : 0
  const pixPreco = base * (1 + taxaPix)
  const entradaNum = parseFloat(entrada || '0')
  const entradaInvalida = base > 0 && entradaNum >= base

  const linhasCartao = useMemo(
    () => modelo ? calcularLinhas(modelo.taxasCartao, base, entradaNum) : [],
    [modelo, base, entradaNum]
  )
  const linhasLink = useMemo(
    () => modelo ? calcularLinhas(modelo.taxasLink, base, entradaNum) : [],
    [modelo, base, entradaNum]
  )
  const linhasFinanciamento = useMemo(
    () => modelo ? calcularLinhas(modelo.taxasFinanciamento, base, entradaNum) : [],
    [modelo, base, entradaNum]
  )

  function handlePrint() {
    if (!modelo) return
    const html = gerarHtmlPrint(modelo, entradaNum, linhasCartao, linhasLink, linhasFinanciamento, pixPreco)
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'width=780,height=960')
    win?.focus()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <>
      {/* Seletor */}
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="max-w-sm space-y-1.5">
          <Label className="text-sm font-medium text-slate-700">Selecione o modelo</Label>
          <Select value={modeloId} onValueChange={v => setModeloId(v ?? '')}>
            <SelectTrigger className="h-11 text-base">
              <SelectValue placeholder="Escolha um modelo..." />
            </SelectTrigger>
            <SelectContent>
              {modelos.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Resultado */}
      {modelo && (
        <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
          <div className="px-6 pt-5 pb-4 border-b bg-slate-50 flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{modelo.nome}</h2>
              <p className="text-sm text-slate-400 mt-0.5">Condições de pagamento</p>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* PIX destaque */}
            <div className="rounded-xl bg-green-50 border border-green-200 p-5 text-center">
              <p className="text-xs text-green-600 uppercase tracking-wider mb-2">PIX / Dinheiro — Melhor preço</p>
              <p className="text-4xl font-bold text-green-700">{fmt(pixPreco)}</p>
              {taxaPix !== 0 && (
                <p className="text-xs text-green-500 mt-1">
                  Base: {fmt(base)} + taxa {(taxaPix * 100).toFixed(2)}%
                </p>
              )}
            </div>

            {/* Entrada */}
            <div className="max-w-xs space-y-1.5">
              <Label>Entrada (R$) — opcional</Label>
              <CurrencyInput value={entrada} onChange={setEntrada} placeholder="0,00" />
              {entradaInvalida && (
                <p className="text-xs text-red-500">Entrada deve ser menor que o valor mínimo</p>
              )}
            </div>

            {!entradaInvalida && (
              <>
                {/* Cartão */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CreditCard size={15} className="text-blue-600" />
                    <h3 className="font-semibold text-sm">Cartão de Crédito</h3>
                  </div>
                  <TabelaOpcoes linhas={linhasCartao} cor="text-blue-700" entrada={entradaNum} />
                </div>

                {/* Link */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Link2 size={15} className="text-purple-600" />
                    <h3 className="font-semibold text-sm">Link de Pagamento</h3>
                  </div>
                  <TabelaOpcoes linhas={linhasLink} cor="text-purple-700" entrada={entradaNum} />
                </div>

                {/* Financiamento */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-amber-600" />
                    <h3 className="font-semibold text-sm">Financiamento</h3>
                    <span className="text-xs text-slate-400">sujeito a aprovação de crédito</span>
                  </div>
                  <TabelaOpcoes linhas={linhasFinanciamento} cor="text-amber-700" entrada={entradaNum} />
                </div>

                <div className="flex justify-end pt-2">
                  <Button onClick={handlePrint} variant="outline" className="gap-2">
                    <Printer size={16} />
                    Imprimir / Salvar PDF
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!modelo && (
        <div className="rounded-xl border bg-white shadow-sm flex items-center justify-center py-24 text-slate-400">
          <p>Selecione um modelo acima para ver as condições</p>
        </div>
      )}
    </>
  )
}
