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
}

type Taxas = {
  taxasCartao: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

type Props = {
  modelos: Modelo[]
  taxas: Taxas
}

function fmt(v: number) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

type Linha = { parcelas: number; credito: number; parcela: number }

function calcularLinhas(taxas: Record<string, number>, base: number, entrada: number): Linha[] {
  const saldo = base - entrada
  return Object.entries(taxas)
    .filter(([, taxa]) => taxa > 0)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([n, taxa]) => {
      const parcelas = parseInt(n)
      const credito = saldo * (1 + taxa)
      const parcela = credito / parcelas
      return { parcelas, credito, parcela }
    })
    .filter(r => r.credito > 0)
}

function TabelaOpcoes({
  linhas, cor, entrada, labelCredito = 'Crédito',
}: {
  linhas: Linha[]
  cor: string
  entrada: number
  labelCredito?: string
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
            {entrada > 0 && (
              <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">{labelCredito}</th>
            )}
            <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Valor da Parcela</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {linhas.map(({ parcelas, credito, parcela }) => (
            <tr key={parcelas} className="hover:bg-slate-50/50">
              <td className="px-3 py-2 font-semibold text-slate-700">{parcelas}x</td>
              {entrada > 0 && (
                <td className="px-3 py-2 text-right text-slate-400 text-xs">{fmt(credito)}</td>
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
  linhasCartao: Linha[],
  linhasLink: Linha[],
  linhasFinanciamento: Linha[],
  linhasCartaoDestaque: Linha[]
) {
  const data = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const nomeEsc = esc(modelo.nome)
  const base = parseFloat(modelo.valorMinimo)
  const cartao21 = linhasCartaoDestaque.find(l => l.parcelas === 21)
  const cartao12 = linhasCartaoDestaque.find(l => l.parcelas === 12)

  function tabelaHtml(linhas: Linha[], cor: string, labelCredito = 'Crédito') {
    if (!linhas.length) return '<p style="color:#94a3b8;font-size:12px;text-align:center;padding:8px">Nenhuma opção configurada</p>'
    return `<table style="width:100%;border-collapse:collapse;font-size:13px">
      <thead>
        <tr style="background:#f8fafc;border-bottom:1px solid #e2e8f0">
          <th style="text-align:left;padding:7px 10px;color:#64748b;font-size:11px">Parcelas</th>
          ${entrada > 0 ? `<th style="text-align:right;padding:7px 10px;color:#64748b;font-size:11px">${labelCredito}</th>` : ''}
          <th style="text-align:right;padding:7px 10px;color:#64748b;font-size:11px">Valor da Parcela</th>
        </tr>
      </thead>
      <tbody>
        ${linhas.map(({ parcelas, credito, parcela }) => `
          <tr style="border-bottom:1px solid #f1f5f9">
            <td style="padding:8px 10px;font-weight:700;color:#334155">${parcelas}x</td>
            ${entrada > 0 ? `<td style="padding:8px 10px;text-align:right;color:#94a3b8;font-size:12px">${fmt(credito)}</td>` : ''}
            <td style="padding:8px 10px;text-align:right;font-weight:700;color:${cor}">${fmt(parcela)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Simulação — ${nomeEsc}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:32px;color:#1e293b;font-size:14px}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}
    .brand{font-size:12px;color:#94a3b8;margin-bottom:4px}
    .model{font-size:24px;font-weight:700}
    .date{font-size:12px;color:#94a3b8}
    .price-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:20px}
    .price-card{border-radius:10px;padding:12px 10px;text-align:center}
    .price-tabela{background:#f8fafc;border:2px solid #e2e8f0}
    .price-desconto{background:#eff6ff;border:2px solid #bfdbfe}
    .price-pix{background:#f0fdf4;border:2px solid #bbf7d0}
    .price-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px;color:#64748b}
    .price-desconto .price-label{color:#3b82f6}
    .price-pix .price-label{color:#16a34a}
    .price-val{font-size:20px;font-weight:700;color:#334155}
    .price-desconto .price-val{color:#1d4ed8}
    .price-pix .price-val{color:#15803d}
    .price-sub{font-size:10px;color:#94a3b8;margin-top:3px}
    .price-desconto .price-sub{color:#93c5fd}
    .price-pix .price-sub{color:#86efac}
    .entrada-tag{text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:8px;margin-bottom:20px;font-size:13px;color:#475569}
    .section{margin-bottom:20px}
    .section-title{font-size:13px;font-weight:700;color:#334155;margin-bottom:10px}
    .section-box{border:1px solid #e2e8f0;border-radius:10px;overflow:hidden}
    .footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;text-align:center}
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

  <div class="price-row">
    <div class="price-card price-tabela">
      <div class="price-label">Valor de Tabela</div>
      <div class="price-val">${cartao21 ? fmt(cartao21.parcela) : '—'}</div>
      <div class="price-sub">21x no cartão</div>
    </div>
    <div class="price-card price-desconto">
      <div class="price-label">Valor com Desconto</div>
      <div class="price-val">${cartao12 ? fmt(cartao12.parcela) : '—'}</div>
      <div class="price-sub">12x no cartão</div>
    </div>
    <div class="price-card price-pix">
      <div class="price-label">Valor Promocional</div>
      <div class="price-val">${fmt(base)}</div>
      <div class="price-sub">PIX / À vista</div>
    </div>
  </div>

  ${entrada > 0 ? `<div class="entrada-tag">Entrada: <strong>${fmt(entrada)}</strong></div>` : ''}

  <div class="section">
    <div class="section-title">💳 Cartão de Crédito</div>
    <div class="section-box">${tabelaHtml(linhasCartao, '#1d4ed8', 'Crédito')}</div>
  </div>
  <div class="section">
    <div class="section-title">🔗 Link de Pagamento</div>
    <div class="section-box">${tabelaHtml(linhasLink, '#7c3aed', 'Crédito')}</div>
  </div>
  <div class="section">
    <div class="section-title">🏦 Financiamento</div>
    <div class="section-box">${tabelaHtml(linhasFinanciamento, '#b45309', 'Financiado')}</div>
  </div>

  <div class="footer">MOVA — Simulação gerada em ${data} · Valores sujeitos a alteração · Sujeito à aprovação de crédito</div>
</body>
</html>`
}

function PrecosDestaque({ base, linhasCartao }: { base: number; linhasCartao: Linha[] }) {
  const cartao21 = linhasCartao.find(l => l.parcelas === 21)
  const cartao12 = linhasCartao.find(l => l.parcelas === 12)

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Valor de Tabela — 21x cartão */}
      <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Valor de Tabela</p>
        {cartao21 ? (
          <>
            <p className="text-xl font-bold text-slate-700">{fmt(cartao21.parcela)}</p>
            <p className="text-xs text-slate-400 mt-0.5">21x no cartão</p>
          </>
        ) : (
          <p className="text-sm text-slate-300 mt-2">—</p>
        )}
      </div>

      {/* Valor com Desconto — 12x cartão */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-500 mb-1">Valor com Desconto</p>
        {cartao12 ? (
          <>
            <p className="text-xl font-bold text-blue-700">{fmt(cartao12.parcela)}</p>
            <p className="text-xs text-blue-400 mt-0.5">12x no cartão</p>
          </>
        ) : (
          <p className="text-sm text-blue-200 mt-2">—</p>
        )}
      </div>

      {/* Valor Promocional — PIX */}
      <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600 mb-1">Valor Promocional</p>
        <p className="text-xl font-bold text-green-700">{fmt(base)}</p>
        <p className="text-xs text-green-500 mt-0.5">PIX / À vista</p>
      </div>
    </div>
  )
}

export function SimuladorClient({ modelos, taxas }: Props) {
  const [modeloId, setModeloId] = useState('')
  const [entrada, setEntrada] = useState('')

  const modelo = modelos.find(m => m.id === modeloId) ?? null
  const base = modelo ? parseFloat(modelo.valorMinimo) : 0
  const entradaNum = parseFloat(entrada || '0')
  const entradaInvalida = base > 0 && entradaNum >= base

  const linhasCartaoDestaque = useMemo(
    () => modelo ? calcularLinhas(taxas.taxasCartao, base, 0) : [],
    [modelo, base, taxas.taxasCartao]
  )
  const linhasCartao = useMemo(
    () => modelo && !entradaInvalida ? calcularLinhas(taxas.taxasCartao, base, entradaNum) : [],
    [modelo, base, entradaNum, entradaInvalida, taxas.taxasCartao]
  )
  const linhasLink = useMemo(
    () => modelo && !entradaInvalida ? calcularLinhas(taxas.taxasLink, base, entradaNum) : [],
    [modelo, base, entradaNum, entradaInvalida, taxas.taxasLink]
  )
  const linhasFinanciamento = useMemo(
    () => modelo && !entradaInvalida ? calcularLinhas(taxas.taxasFinanciamento, base, entradaNum) : [],
    [modelo, base, entradaNum, entradaInvalida, taxas.taxasFinanciamento]
  )

  function handlePrint() {
    if (!modelo) return
    const html = gerarHtmlPrint(modelo, entradaNum, linhasCartao, linhasLink, linhasFinanciamento, linhasCartaoDestaque)
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
            <SelectTrigger className="h-11 text-base w-full">
              <span className={modeloId ? 'text-foreground' : 'text-muted-foreground'}>
                {modeloId ? (modelos.find(m => m.id === modeloId)?.nome ?? 'Escolha um modelo...') : 'Escolha um modelo...'}
              </span>
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
          <div className="px-6 pt-5 pb-4 border-b bg-slate-50">
            <h2 className="text-2xl font-bold text-slate-900">{modelo.nome}</h2>
            <p className="text-sm text-slate-400 mt-0.5">Condições de pagamento</p>
          </div>

          <div className="p-6 space-y-6">
            {/* Resumo de preços destacados */}
            <PrecosDestaque base={base} linhasCartao={linhasCartaoDestaque} />

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
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <CreditCard size={15} className="text-blue-600" />
                    <h3 className="font-semibold text-sm">Cartão de Crédito</h3>
                  </div>
                  <TabelaOpcoes linhas={linhasCartao} cor="text-blue-700" entrada={entradaNum} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Link2 size={15} className="text-purple-600" />
                    <h3 className="font-semibold text-sm">Link de Pagamento</h3>
                  </div>
                  <TabelaOpcoes linhas={linhasLink} cor="text-purple-700" entrada={entradaNum} />
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Building2 size={15} className="text-amber-600" />
                    <h3 className="font-semibold text-sm">Financiamento</h3>
                    <span className="text-xs text-slate-400">sujeito a aprovação de crédito</span>
                  </div>
                  <TabelaOpcoes linhas={linhasFinanciamento} cor="text-amber-700" entrada={entradaNum} labelCredito="Financiado" />
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
