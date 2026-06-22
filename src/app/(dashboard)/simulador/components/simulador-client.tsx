'use client'
import { useState, useMemo } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { CreditCard, Link2, Building2, Printer, ChevronDown } from 'lucide-react'

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  imagemUrl: string | null
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
  linhas, cor, entrada, mostrarTotal = false, labelCredito = 'Financiado',
}: {
  linhas: Linha[]
  cor: string
  entrada: number
  mostrarTotal?: boolean
  labelCredito?: string
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-slate-400 py-4 text-center">Nenhuma opção configurada</p>
  }
  return (
    <div className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-3 py-2 text-xs text-slate-500 font-medium">Parcelas</th>
            <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">Valor da Parcela</th>
            {mostrarTotal && (
              <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">
                Total{entrada > 0 ? ' (s/ entrada)' : ''}
              </th>
            )}
            {!mostrarTotal && entrada > 0 && (
              <th className="text-right px-3 py-2 text-xs text-slate-500 font-medium">{labelCredito}</th>
            )}
          </tr>
        </thead>
        <tbody className="divide-y">
          {linhas.map(({ parcelas, credito, parcela }) => (
            <tr key={parcelas} className="hover:bg-slate-50/50">
              <td className="px-3 py-2 font-semibold text-slate-700">{parcelas}x</td>
              <td className={`px-3 py-2 text-right font-bold ${cor}`}>{fmt(parcela)}</td>
              {mostrarTotal && (
                <td className="px-3 py-2 text-right text-slate-400 text-xs">{fmt(credito)}</td>
              )}
              {!mostrarTotal && entrada > 0 && (
                <td className="px-3 py-2 text-right text-slate-400 text-xs">{fmt(credito)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function pct(a: number, b: number) {
  if (!b) return null
  const d = ((b - a) / b) * 100
  return d > 0 ? d.toFixed(0) : null
}

function gerarHtmlPrint(
  modelo: Modelo,
  entrada: number,
  linhasCartao: Linha[],
  _linhasLink: Linha[],
  _linhasFinanciamento: Linha[],
  linhasCartaoDestaque: Linha[]
) {
  const data = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const nomeEsc = esc(modelo.nome)
  const base = parseFloat(modelo.valorMinimo)
  const tabela21 = linhasCartaoDestaque.find(l => l.parcelas === 21)
  const cartao21 = linhasCartao.find(l => l.parcelas === 21) ?? tabela21
  const cartao12 = linhasCartao.find(l => l.parcelas === 12) ?? linhasCartaoDestaque.find(l => l.parcelas === 12)
  const desc12 = cartao21 && cartao12 ? pct(cartao12.credito, cartao21.credito) : null
  const eco12 = cartao21 && cartao12 ? cartao21.credito - cartao12.credito : null
  const descPix = tabela21 ? pct(base, tabela21.credito) : null
  const ecoPix = tabela21 ? tabela21.credito - base : null

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Simulação — ${nomeEsc}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:40px;color:#1e293b;font-size:14px;max-width:600px;margin:0 auto}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}
    .brand{font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
    .model{font-size:28px;font-weight:700}
    .date{font-size:11px;color:#94a3b8;text-align:right}
    .price-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
    .price-card{border-radius:12px;padding:18px 12px;text-align:center;position:relative}
    .price-tabela{background:#f8fafc;border:2px solid #e2e8f0}
    .price-desconto{background:#eff6ff;border:2px solid #bfdbfe}
    .price-pix{background:#f0fdf4;border:2px solid #bbf7d0}
    .price-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:10px;color:#64748b}
    .price-desconto .price-label{color:#3b82f6}
    .price-pix .price-label{color:#16a34a}
    .price-val{font-size:22px;font-weight:700;color:#334155;margin-bottom:6px}
    .price-desconto .price-val{color:#1d4ed8}
    .price-pix .price-val{color:#15803d}
    .price-sub{font-size:11px;color:#94a3b8}
    .price-desconto .price-sub{color:#93c5fd}
    .price-pix .price-sub{color:#86efac}
    .badge{display:inline-block;margin-top:8px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
    .badge-blue{background:#dbeafe;color:#1d4ed8}
    .badge-green{background:#dcfce7;color:#15803d}
    .entrada-tag{text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:16px;font-size:13px;color:#475569}
    .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:16px">
      ${modelo.imagemUrl ? `<img src="${modelo.imagemUrl}" alt="${nomeEsc}" style="height:80px;width:120px;object-fit:contain;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;padding:4px">` : ''}
      <div>
        <div class="brand">MOVA — Gestão em Mobilidade Elétrica</div>
        <div class="model">${nomeEsc}</div>
      </div>
    </div>
    <div class="date">${data}</div>
  </div>

  ${entrada > 0 ? `<div class="entrada-tag">Entrada: <strong>${fmt(entrada)}</strong></div>` : ''}

  <div class="price-row">
    <div class="price-card price-tabela">
      <div class="price-label">Valor de Tabela</div>
      <div class="price-val">${cartao21 ? fmt(cartao21.credito) : '—'}</div>
      <div class="price-sub">${cartao21 ? `21x de ${fmt(cartao21.parcela)}` : '21x no cartão'}</div>
    </div>
    <div class="price-card price-desconto">
      <div class="price-label">Valor com Desconto</div>
      <div class="price-val">${cartao12 ? fmt(cartao12.credito) : '—'}</div>
      <div class="price-sub">${cartao12 ? `12x de ${fmt(cartao12.parcela)}` : '12x no cartão'}</div>
      ${desc12 ? `<div class="badge badge-blue">${desc12}% de desconto</div>` : ''}
      ${eco12 && eco12 > 0 ? `<div style="font-size:10px;color:#3b82f6;margin-top:3px">Economia de ${fmt(eco12)}</div>` : ''}
    </div>
    <div class="price-card price-pix">
      <div class="price-label">Valor Promocional</div>
      <div class="price-val">${fmt(base)}</div>
      <div class="price-sub">PIX / Dinheiro</div>
      ${descPix ? `<div class="badge badge-green">${descPix}% de desconto</div>` : ''}
      ${ecoPix && ecoPix > 0 ? `<div style="font-size:10px;color:#16a34a;margin-top:3px">Economia de ${fmt(ecoPix)}</div>` : ''}
    </div>
  </div>

  <div class="footer">MOVA · Simulação gerada em ${data} · Valores sujeitos a alteração sem aviso prévio · Financiamento sujeito a aprovação de crédito</div>
</body>
</html>`
}

function DescontoBadge({ pct: pctStr, economia, corBadge, corEcon }: { pct: string | null; economia: number | null; corBadge: string; corEcon: string }) {
  if (!pctStr) return null
  return (
    <div className="mt-2 space-y-0.5">
      <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${corBadge}`}>
        {pctStr}% de desconto
      </span>
      {economia !== null && economia > 0 && (
        <p className={`text-[10px] font-semibold ${corEcon}`}>
          Economia de {fmt(economia)}
        </p>
      )}
    </div>
  )
}

function PrecosDestaque({
  base, linhasCartao, linhasCartaoDestaque,
}: {
  base: number
  linhasCartao: Linha[]        // com entrada aplicada
  linhasCartaoDestaque: Linha[] // sem entrada (referência de tabela)
}) {
  const cartao21 = linhasCartao.find(l => l.parcelas === 21)
  const cartao12 = linhasCartao.find(l => l.parcelas === 12)
  const tabela21 = linhasCartaoDestaque.find(l => l.parcelas === 21) // baseline para desconto PIX

  // Desconto 12x vs 21x (ambos com entrada)
  const desc12 = cartao21 && cartao12 ? pct(cartao12.credito, cartao21.credito) : null
  const eco12 = cartao21 && cartao12 ? cartao21.credito - cartao12.credito : null

  // Desconto PIX vs tabela 21x sem entrada (PIX não muda com entrada)
  const descPix = tabela21 ? pct(base, tabela21.credito) : null
  const ecoPix = tabela21 ? tabela21.credito - base : null

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Valor de Tabela — 21x cartão (com entrada se houver) */}
      <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Valor de Tabela</p>
        {cartao21 ? (
          <>
            <p className="text-lg font-bold text-slate-700">{fmt(cartao21.credito)}</p>
            <p className="text-xs text-slate-400 mt-1">21x de {fmt(cartao21.parcela)}</p>
          </>
        ) : (
          <p className="text-sm text-slate-300 mt-2">—</p>
        )}
      </div>

      {/* Valor com Desconto — 12x cartão (com entrada se houver) */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-500 mb-2">Valor com Desconto</p>
        {cartao12 ? (
          <>
            <p className="text-lg font-bold text-blue-700">{fmt(cartao12.credito)}</p>
            <p className="text-xs text-blue-400 mt-1">12x de {fmt(cartao12.parcela)}</p>
            <DescontoBadge pct={desc12} economia={eco12} corBadge="bg-blue-100 text-blue-700" corEcon="text-blue-500" />
          </>
        ) : (
          <p className="text-sm text-blue-200 mt-2">—</p>
        )}
      </div>

      {/* Valor Promocional — PIX/Dinheiro (sempre base, não muda com entrada) */}
      <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600 mb-2">Valor Promocional</p>
        <p className="text-lg font-bold text-green-700">{fmt(base)}</p>
        <p className="text-xs text-green-500 mt-1">PIX / Dinheiro</p>
        <DescontoBadge pct={descPix} economia={ecoPix} corBadge="bg-green-100 text-green-700" corEcon="text-green-600" />
      </div>
    </div>
  )
}

export function SimuladorClient({ modelos, taxas }: Props) {
  const [modeloId, setModeloId] = useState('')
  const [entrada, setEntrada] = useState('')
  const [aberto, setAberto] = useState<Record<string, boolean>>({ cartao: false, link: false, financiamento: false })
  const toggle = (k: string) => setAberto(prev => ({ ...prev, [k]: !prev[k] }))

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
          <div className="border-b bg-slate-50 flex items-center gap-5 px-6 py-4">
            {modelo.imagemUrl && (
              <img
                src={modelo.imagemUrl}
                alt={modelo.nome}
                className="h-24 w-36 object-contain rounded-lg bg-white border p-1 shrink-0"
              />
            )}
            <div>
              <h2 className="text-2xl font-bold text-slate-900">{modelo.nome}</h2>
              <p className="text-sm text-slate-400 mt-0.5">Condições de pagamento</p>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Resumo de preços destacados */}
            <PrecosDestaque
              base={base}
              linhasCartao={entradaInvalida ? linhasCartaoDestaque : linhasCartao}
              linhasCartaoDestaque={linhasCartaoDestaque}
            />

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
                {/* Cartão — colapsável */}
                <div className="rounded-xl border overflow-hidden">
                  <button
                    onClick={() => toggle('cartao')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard size={15} className="text-blue-600" />
                      <span className="font-semibold text-sm text-blue-800">Cartão de Crédito</span>
                      <span className="text-xs text-blue-400">{linhasCartao.length} opções</span>
                    </div>
                    <ChevronDown size={16} className={`text-blue-500 transition-transform ${aberto.cartao ? 'rotate-180' : ''}`} />
                  </button>
                  {aberto.cartao && (
                    <TabelaOpcoes linhas={linhasCartao} cor="text-blue-700" entrada={entradaNum} mostrarTotal />
                  )}
                </div>

                {/* Link — colapsável */}
                <div className="rounded-xl border overflow-hidden">
                  <button
                    onClick={() => toggle('link')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Link2 size={15} className="text-purple-600" />
                      <span className="font-semibold text-sm text-purple-800">Link de Pagamento</span>
                      <span className="text-xs text-purple-400">{linhasLink.length} opções</span>
                    </div>
                    <ChevronDown size={16} className={`text-purple-500 transition-transform ${aberto.link ? 'rotate-180' : ''}`} />
                  </button>
                  {aberto.link && (
                    <TabelaOpcoes linhas={linhasLink} cor="text-purple-700" entrada={entradaNum} mostrarTotal />
                  )}
                </div>

                {/* Financiamento — colapsável */}
                <div className="rounded-xl border overflow-hidden">
                  <button
                    onClick={() => toggle('financiamento')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 size={15} className="text-amber-600" />
                      <span className="font-semibold text-sm text-amber-800">Financiamento</span>
                      <span className="text-xs text-amber-400">sujeito a aprovação de crédito</span>
                    </div>
                    <ChevronDown size={16} className={`text-amber-500 transition-transform ${aberto.financiamento ? 'rotate-180' : ''}`} />
                  </button>
                  {aberto.financiamento && (
                    <TabelaOpcoes linhas={linhasFinanciamento} cor="text-amber-700" entrada={entradaNum} labelCredito="Financiado" />
                  )}
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
