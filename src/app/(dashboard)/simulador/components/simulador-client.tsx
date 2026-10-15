'use client'
import { useState, useMemo, type Dispatch, type SetStateAction } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { CreditCard, Link2, Building2, Printer, ChevronDown, Wallet } from 'lucide-react'
import { FreteSimulador } from './frete-simulador'
import type { ResultadoFrete } from '../actions'

// Financiamento oculto no simulador e no PDF, para todos, a pedido do Luis (#161,
// 15/10/2026). É temporário: para voltar, troque para true. As taxas seguem na Precificação.
const MOSTRAR_FINANCIAMENTO = false

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  imagemUrl: string | null
}

type Taxas = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
}

type Props = {
  modelos: Modelo[]
  taxas: Taxas
  lojasFrete: { id: string; nome: string; temCep: boolean }[]
  isAdmin: boolean
  lojaUsuarioId: string | null
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

// Tabela de opções com checkboxes opcionais
function TabelaOpcoes({
  linhas, cor, entrada, mostrarTotal = false, labelCredito = 'Financiado',
  selecionados, onToggle,
}: {
  linhas: Linha[]
  cor: string
  entrada: number
  mostrarTotal?: boolean
  labelCredito?: string
  selecionados?: Set<number>
  onToggle?: (parcelas: number) => void
}) {
  if (linhas.length === 0) {
    return <p className="text-sm text-slate-400 py-4 text-center">Nenhuma opção configurada</p>
  }
  const comCheckbox = !!selecionados && !!onToggle
  return (
    <div className="overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            {comCheckbox && <th className="w-8 px-3 py-2" />}
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
          {linhas.map(({ parcelas, credito, parcela }) => {
            const checked = selecionados?.has(parcelas) ?? false
            return (
              <tr
                key={parcelas}
                className={`hover:bg-slate-50/50 ${comCheckbox ? 'cursor-pointer' : ''} ${checked ? 'bg-blue-50/60' : ''}`}
                onClick={comCheckbox ? () => onToggle!(parcelas) : undefined}
              >
                {comCheckbox && (
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => onToggle!(parcelas)}
                      onClick={e => e.stopPropagation()}
                      className="h-4 w-4 rounded border-slate-300 accent-blue-600"
                    />
                  </td>
                )}
                <td className="px-3 py-2 font-semibold text-slate-700">{parcelas}x</td>
                <td className={`px-3 py-2 text-right font-bold ${cor}`}>{fmt(parcela)}</td>
                {mostrarTotal && (
                  <td className="px-3 py-2 text-right text-slate-400 text-xs">{fmt(credito)}</td>
                )}
                {!mostrarTotal && entrada > 0 && (
                  <td className="px-3 py-2 text-right text-slate-400 text-xs">{fmt(credito)}</td>
                )}
              </tr>
            )
          })}
        </tbody>
      </table>
      {comCheckbox && selecionados!.size > 0 && (
        <p className="px-3 py-1.5 text-xs text-blue-600 bg-blue-50 border-t">
          {selecionados!.size} opção(ões) selecionada(s) para impressão
        </p>
      )}
    </div>
  )
}

function pct(a: number, b: number) {
  if (!b) return null
  const d = ((b - a) / b) * 100
  return d > 0 ? d.toFixed(0) : null
}

type SecaoSelecionada = {
  titulo: string
  corLabel: string
  corBg: string
  corBorder: string
  corValor: string
  linhas: Linha[]
  selecionados: Set<number>
  comEntrada: boolean
  entrada: number
}

type SecaoSelecionadaOpts = SecaoSelecionada & { labelTotal?: string }

function gerarTabelaSelecionada({ titulo, corLabel, corBg, corBorder, corValor, linhas, selecionados, comEntrada, entrada, labelTotal = 'Total' }: SecaoSelecionadaOpts) {
  const linhasParaImprimir = selecionados.size > 0 ? linhas.filter(l => selecionados.has(l.parcelas)) : []
  if (linhasParaImprimir.length === 0) return ''
  return `
  <div style="margin-bottom:20px">
    <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:${corLabel};margin-bottom:10px;border-left:3px solid ${corLabel};padding-left:8px">
      ${esc(titulo)}${comEntrada && entrada > 0 ? ` <span style="font-weight:400;color:#94a3b8">(entrada: ${fmt(entrada)})</span>` : ''}
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;border:1px solid ${corBorder};border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:${corBg}">
          <th style="text-align:left;padding:7px 10px;color:${corLabel};font-size:11px">Parcelas</th>
          <th style="text-align:right;padding:7px 10px;color:${corLabel};font-size:11px">Valor da Parcela</th>
          <th style="text-align:right;padding:7px 10px;color:${corLabel};font-size:11px">${esc(labelTotal)}</th>
          ${comEntrada && entrada > 0 ? `<th style="text-align:right;padding:7px 10px;color:${corLabel};font-size:11px">Total (c/ entrada)</th>` : ''}
        </tr>
      </thead>
      <tbody>
        ${linhasParaImprimir.map(({ parcelas, credito, parcela }) => `
        <tr style="border-bottom:1px solid ${corBorder}">
          <td style="padding:8px 10px;font-weight:700;color:${corValor}">${parcelas}x</td>
          <td style="padding:8px 10px;text-align:right;font-weight:700;color:${corValor}">${fmt(parcela)}</td>
          <td style="padding:8px 10px;text-align:right;color:#64748b;font-size:11px">${fmt(credito)}</td>
          ${comEntrada && entrada > 0 ? `<td style="padding:8px 10px;text-align:right;color:${corValor};font-weight:600;font-size:12px">${fmt(entrada + credito)}</td>` : ''}
        </tr>`).join('')}
      </tbody>
    </table>
  </div>`
}

function gerarHtmlPrint(
  modelo: Modelo,
  entrada: number,
  linhasCartaoSemEntrada: Linha[],
  linhasCartaoComEntrada: Linha[],
  linhasDebito: Linha[],
  linhasLink: Linha[],
  linhasFinanciamento: Linha[],
  selCartao: Set<number>,
  selDebito: Set<number>,
  selLink: Set<number>,
  selFinanciamento: Set<number>,
  frete: { kmIdaEVolta: number; custo: number } | null,
) {
  const data = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const nomeEsc = esc(modelo.nome)
  const base = parseFloat(modelo.valorMinimo)
  const imgUrl = modelo.imagemUrl && /^https:\/\//i.test(modelo.imagemUrl) ? esc(modelo.imagemUrl) : null

  // Preços de referência sempre sem entrada (valores cheios)
  const cartao21 = linhasCartaoSemEntrada.find(l => l.parcelas === 21)
  const cartao12 = linhasCartaoSemEntrada.find(l => l.parcelas === 12)
  const desc12 = cartao21 && cartao12 ? pct(cartao12.credito, cartao21.credito) : null
  const eco12 = cartao21 && cartao12 ? cartao21.credito - cartao12.credito : null
  const descPix = cartao21 ? pct(base, cartao21.credito) : null
  const ecoPix = cartao21 ? cartao21.credito - base : null

  const linhasCartaoParaPrint = entrada > 0 ? linhasCartaoComEntrada : linhasCartaoSemEntrada

  const tabelasSelecionadas = [
    gerarTabelaSelecionada({ titulo: 'Opções Selecionadas — Cartão de Crédito', corLabel: '#3b82f6', corBg: '#eff6ff', corBorder: '#bfdbfe', corValor: '#1d4ed8', linhas: linhasCartaoParaPrint, selecionados: selCartao, comEntrada: true, entrada, labelTotal: 'Total Cartão' }),
    gerarTabelaSelecionada({ titulo: 'Opções Selecionadas — Cartão de Débito', corLabel: '#0d9488', corBg: '#f0fdfa', corBorder: '#99f6e4', corValor: '#0f766e', linhas: linhasDebito, selecionados: selDebito, comEntrada: true, entrada, labelTotal: 'Total Débito' }),
    gerarTabelaSelecionada({ titulo: 'Opções Selecionadas — Link de Pagamento', corLabel: '#7c3aed', corBg: '#f5f3ff', corBorder: '#ddd6fe', corValor: '#6d28d9', linhas: linhasLink, selecionados: selLink, comEntrada: true, entrada, labelTotal: 'Total Link' }),
    gerarTabelaSelecionada({ titulo: 'Opções Selecionadas — Financiamento', corLabel: '#d97706', corBg: '#fffbeb', corBorder: '#fde68a', corValor: '#b45309', linhas: linhasFinanciamento, selecionados: selFinanciamento, comEntrada: false, entrada, labelTotal: 'Total Financiado' }),
  ].join('')

  const blocoFrete = frete ? `
  <div style="margin-bottom:20px;padding:12px;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0">
    <div style="font-size:11px;color:#64748b">Frete: ${frete.custo > 0 ? fmt(frete.custo) : 'Grátis'} (${frete.kmIdaEVolta.toFixed(1)} km ida e volta)</div>
    <div style="font-size:13px;font-weight:700;color:#334155;margin-top:2px">Total com frete (PIX): ${fmt(base + frete.custo)}</div>
  </div>` : ''

  // "Com entrada" subsections — só aparecem quando há entrada
  const c21Entrada = entrada > 0 ? linhasCartaoComEntrada.find(l => l.parcelas === 21) : null
  const c12Entrada = entrada > 0 ? linhasCartaoComEntrada.find(l => l.parcelas === 12) : null

  const entradaSubTabela = (linha: Linha | null | undefined, cor: string) => linha ? `
    <div style="margin-top:10px;padding-top:10px;border-top:1px solid ${cor}">
      <div style="font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:#94a3b8;margin-bottom:5px">Com entrada</div>
      <div style="font-size:14px;font-weight:700;color:#334155">${fmt(linha.credito)} no cartão</div>
      <div style="font-size:10px;color:#94a3b8;margin-top:2px">${linha.parcelas}x de ${fmt(linha.parcela)}</div>
    </div>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Simulação — ${nomeEsc}</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:40px;color:#1e293b;font-size:14px;max-width:640px;margin:0 auto}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid #e2e8f0}
    .brand{font-size:11px;color:#94a3b8;margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
    .model{font-size:26px;font-weight:700}
    .date{font-size:11px;color:#94a3b8;text-align:right;white-space:nowrap}
    .price-row{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
    .price-card{border-radius:12px;padding:16px 12px;text-align:center}
    .price-tabela{background:#f8fafc;border:2px solid #e2e8f0}
    .price-desconto{background:#eff6ff;border:2px solid #bfdbfe}
    .price-pix{background:#f0fdf4;border:2px solid #bbf7d0}
    .price-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px;color:#64748b}
    .price-desconto .price-label{color:#3b82f6}
    .price-pix .price-label{color:#16a34a}
    .price-val{font-size:20px;font-weight:700;color:#334155;margin-bottom:4px}
    .price-desconto .price-val{color:#1d4ed8}
    .price-pix .price-val{color:#15803d}
    .price-sub{font-size:11px;color:#94a3b8}
    .price-desconto .price-sub{color:#93c5fd}
    .price-pix .price-sub{color:#86efac}
    .badge{display:inline-block;margin-top:7px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700}
    .badge-blue{background:#dbeafe;color:#1d4ed8}
    .badge-green{background:#dcfce7;color:#15803d}
    .eco{font-size:10px;margin-top:3px}
    .price-desconto .eco{color:#3b82f6}
    .price-pix .eco{color:#16a34a}
    .entrada-tag{text-align:center;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px;margin-bottom:16px;font-size:13px;color:#475569}
    .footer{margin-top:32px;padding-top:12px;border-top:1px solid #e2e8f0;font-size:10px;color:#94a3b8;text-align:center}
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:16px">
      ${imgUrl ? `<img src="${imgUrl}" alt="${nomeEsc}" style="height:72px;width:108px;object-fit:contain;border-radius:8px;background:#f8fafc;border:1px solid #e2e8f0;padding:4px">` : ''}
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
      ${entradaSubTabela(c21Entrada, '#e2e8f0')}
    </div>
    <div class="price-card price-desconto">
      <div class="price-label">Valor com Desconto</div>
      <div class="price-val">${cartao12 ? fmt(cartao12.credito) : '—'}</div>
      <div class="price-sub">${cartao12 ? `12x de ${fmt(cartao12.parcela)}` : '12x no cartão'}</div>
      ${desc12 ? `<div class="badge badge-blue">${desc12}% de desconto</div>` : ''}
      ${eco12 && eco12 > 0 ? `<div class="eco">Economia de ${fmt(eco12)}</div>` : ''}
      ${entradaSubTabela(c12Entrada, '#bfdbfe')}
    </div>
    <div class="price-card price-pix">
      <div class="price-label">Valor Promocional</div>
      <div class="price-val">${fmt(base)}</div>
      <div class="price-sub">PIX / Dinheiro</div>
      ${descPix ? `<div class="badge badge-green">${descPix}% de desconto</div>` : ''}
      ${ecoPix && ecoPix > 0 ? `<div class="eco">Economia de ${fmt(ecoPix)}</div>` : ''}
    </div>
  </div>

  ${tabelasSelecionadas}

  ${blocoFrete}

  <div class="footer">MOVA · Simulação gerada em ${data} · Valores sujeitos a alteração sem aviso prévio${MOSTRAR_FINANCIAMENTO ? ' · Financiamento sujeito a aprovação de crédito' : ''}</div>
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
  base, linhasCartaoDestaque, linhasCartaoComEntrada, entrada,
}: {
  base: number
  linhasCartaoDestaque: Linha[]
  linhasCartaoComEntrada: Linha[]
  entrada: number
}) {
  const cartao21 = linhasCartaoDestaque.find(l => l.parcelas === 21)
  const cartao12 = linhasCartaoDestaque.find(l => l.parcelas === 12)
  const c21Entrada = entrada > 0 ? linhasCartaoComEntrada.find(l => l.parcelas === 21) : null
  const c12Entrada = entrada > 0 ? linhasCartaoComEntrada.find(l => l.parcelas === 12) : null

  const desc12 = cartao21 && cartao12 ? pct(cartao12.credito, cartao21.credito) : null
  const eco12  = cartao21 && cartao12 ? cartao21.credito - cartao12.credito : null
  const descPix = cartao21 ? pct(base, cartao21.credito) : null
  const ecoPix  = cartao21 ? cartao21.credito - base : null

  return (
    <div className="grid grid-cols-3 gap-3">
      {/* Valor de Tabela — 21x */}
      <div className="rounded-xl border-2 border-slate-200 bg-slate-50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-2">Valor de Tabela</p>
        {cartao21 ? (
          <>
            <p className="text-lg font-bold text-slate-700">{fmt(cartao21.credito)}</p>
            <p className="text-xs text-slate-400 mt-1">21x de {fmt(cartao21.parcela)}</p>
            {c21Entrada && (
              <div className="mt-2 pt-2 border-t border-slate-200">
                <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Com entrada</p>
                <p className="text-xs font-bold text-slate-700">{fmt(c21Entrada.credito)} no cartão</p>
                <p className="text-xs text-slate-500">21x de {fmt(c21Entrada.parcela)}</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-slate-300 mt-2">—</p>
        )}
      </div>

      {/* Valor com Desconto — 12x */}
      <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-blue-500 mb-2">Valor com Desconto</p>
        {cartao12 ? (
          <>
            <p className="text-lg font-bold text-blue-700">{fmt(cartao12.credito)}</p>
            <p className="text-xs text-blue-400 mt-1">12x de {fmt(cartao12.parcela)}</p>
            <DescontoBadge pct={desc12} economia={eco12} corBadge="bg-blue-100 text-blue-700" corEcon="text-blue-500" />
            {c12Entrada && (
              <div className="mt-2 pt-2 border-t border-blue-200">
                <p className="text-[10px] text-blue-400 uppercase tracking-wide mb-1">Com entrada</p>
                <p className="text-xs font-bold text-blue-700">{fmt(c12Entrada.credito)} no cartão</p>
                <p className="text-xs text-blue-500">12x de {fmt(c12Entrada.parcela)}</p>
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-blue-200 mt-2">—</p>
        )}
      </div>

      {/* Valor Promocional — PIX/Dinheiro */}
      <div className="rounded-xl border-2 border-green-300 bg-green-50 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-green-600 mb-2">Valor Promocional</p>
        <p className="text-lg font-bold text-green-700">{fmt(base)}</p>
        <p className="text-xs text-green-500 mt-1">PIX / Dinheiro</p>
        <DescontoBadge pct={descPix} economia={ecoPix} corBadge="bg-green-100 text-green-700" corEcon="text-green-600" />
      </div>
    </div>
  )
}

export function SimuladorClient({ modelos, taxas, lojasFrete, isAdmin, lojaUsuarioId }: Props) {
  const [modeloId, setModeloId] = useState('')
  const [entrada, setEntrada] = useState('')
  const [freteResultado, setFreteResultado] = useState<ResultadoFrete | null>(null)
  const [aberto, setAberto] = useState<Record<string, boolean>>({ cartao: false, debito: false, link: false, financiamento: false })
  const [selCartao, setSelCartao] = useState<Set<number>>(new Set())
  const [selDebito, setSelDebito] = useState<Set<number>>(new Set())
  const [selLink, setSelLink] = useState<Set<number>>(new Set())
  const [selFinanciamento, setSelFinanciamento] = useState<Set<number>>(new Set())
  const toggle = (k: string) => setAberto(prev => ({ ...prev, [k]: !prev[k] }))

  function makeToggle(setter: Dispatch<SetStateAction<Set<number>>>) {
    return (parcelas: number) => setter(prev => {
      const next = new Set(prev)
      if (next.has(parcelas)) { next.delete(parcelas) } else { next.add(parcelas) }
      return next
    })
  }
  const toggleCartao = makeToggle(setSelCartao)
  const toggleDebito = makeToggle(setSelDebito)
  const toggleLink = makeToggle(setSelLink)
  const toggleFinanciamento = makeToggle(setSelFinanciamento)

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
  const linhasDebito = useMemo(
    () => modelo && !entradaInvalida ? calcularLinhas(taxas.taxasDebito, base, entradaNum) : [],
    [modelo, base, entradaNum, entradaInvalida, taxas.taxasDebito]
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
    const html = gerarHtmlPrint(
      modelo,
      entradaNum,
      linhasCartaoDestaque,
      linhasCartao,
      linhasDebito,
      linhasLink,
      linhasFinanciamento,
      selCartao,
      selDebito,
      selLink,
      MOSTRAR_FINANCIAMENTO ? selFinanciamento : new Set<number>(),
      freteResultado?.ok ? freteResultado : null,
    )
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
              linhasCartaoDestaque={linhasCartaoDestaque}
              linhasCartaoComEntrada={linhasCartao}
              entrada={entradaInvalida ? 0 : entradaNum}
            />

            <FreteSimulador
              lojas={lojasFrete}
              isAdmin={isAdmin}
              lojaUsuarioId={lojaUsuarioId}
              onResultado={setFreteResultado}
            />

            {freteResultado?.ok && (
              <p className="text-sm font-medium text-slate-700">
                Total com frete (PIX): {fmt(base + freteResultado.custo)}
              </p>
            )}

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
                {/* Cartão — colapsável com checkboxes */}
                <div className="rounded-xl border overflow-hidden">
                  <button
                    onClick={() => toggle('cartao')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-blue-50 hover:bg-blue-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <CreditCard size={15} className="text-blue-600" />
                      <span className="font-semibold text-sm text-blue-800">Cartão de Crédito</span>
                      <span className="text-xs text-blue-400">{linhasCartao.length} opções</span>
                      {selCartao.size > 0 && (
                        <span className="text-xs bg-blue-600 text-white px-1.5 py-0.5 rounded-full">
                          {selCartao.size} selecionada(s)
                        </span>
                      )}
                    </div>
                    <ChevronDown size={16} className={`text-blue-500 transition-transform ${aberto.cartao ? 'rotate-180' : ''}`} />
                  </button>
                  {aberto.cartao && (
                    <TabelaOpcoes
                      linhas={linhasCartao}
                      cor="text-blue-700"
                      entrada={entradaNum}
                      mostrarTotal
                      selecionados={selCartao}
                      onToggle={toggleCartao}
                    />
                  )}
                </div>

                {/* Débito — colapsável com checkboxes */}
                {linhasDebito.length > 0 && (
                  <div className="rounded-xl border overflow-hidden">
                    <button
                      onClick={() => toggle('debito')}
                      className="w-full flex items-center justify-between px-4 py-3 bg-teal-50 hover:bg-teal-100 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <Wallet size={15} className="text-teal-600" />
                        <span className="font-semibold text-sm text-teal-800">Cartão de Débito</span>
                        <span className="text-xs text-teal-400">{linhasDebito.length} opções</span>
                        {selDebito.size > 0 && (
                          <span className="text-xs bg-teal-600 text-white px-1.5 py-0.5 rounded-full">
                            {selDebito.size} selecionada(s)
                          </span>
                        )}
                      </div>
                      <ChevronDown size={16} className={`text-teal-500 transition-transform ${aberto.debito ? 'rotate-180' : ''}`} />
                    </button>
                    {aberto.debito && (
                      <TabelaOpcoes
                        linhas={linhasDebito}
                        cor="text-teal-700"
                        entrada={entradaNum}
                        mostrarTotal
                        selecionados={selDebito}
                        onToggle={toggleDebito}
                      />
                    )}
                  </div>
                )}

                {/* Link — colapsável com checkboxes */}
                <div className="rounded-xl border overflow-hidden">
                  <button
                    onClick={() => toggle('link')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-purple-50 hover:bg-purple-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Link2 size={15} className="text-purple-600" />
                      <span className="font-semibold text-sm text-purple-800">Link de Pagamento</span>
                      <span className="text-xs text-purple-400">{linhasLink.length} opções</span>
                      {selLink.size > 0 && (
                        <span className="text-xs bg-purple-600 text-white px-1.5 py-0.5 rounded-full">
                          {selLink.size} selecionada(s)
                        </span>
                      )}
                    </div>
                    <ChevronDown size={16} className={`text-purple-500 transition-transform ${aberto.link ? 'rotate-180' : ''}`} />
                  </button>
                  {aberto.link && (
                    <TabelaOpcoes
                      linhas={linhasLink}
                      cor="text-purple-700"
                      entrada={entradaNum}
                      mostrarTotal
                      selecionados={selLink}
                      onToggle={toggleLink}
                    />
                  )}
                </div>

                {/* Financiamento — colapsável com checkboxes */}
                {MOSTRAR_FINANCIAMENTO && (
                <div className="rounded-xl border overflow-hidden">
                  <button
                    onClick={() => toggle('financiamento')}
                    className="w-full flex items-center justify-between px-4 py-3 bg-amber-50 hover:bg-amber-100 transition-colors"
                  >
                    <div className="flex items-center gap-2">
                      <Building2 size={15} className="text-amber-600" />
                      <span className="font-semibold text-sm text-amber-800">Financiamento</span>
                      <span className="text-xs text-amber-400">sujeito a aprovação de crédito</span>
                      {selFinanciamento.size > 0 && (
                        <span className="text-xs bg-amber-600 text-white px-1.5 py-0.5 rounded-full">
                          {selFinanciamento.size} selecionada(s)
                        </span>
                      )}
                    </div>
                    <ChevronDown size={16} className={`text-amber-500 transition-transform ${aberto.financiamento ? 'rotate-180' : ''}`} />
                  </button>
                  {aberto.financiamento && (
                    <TabelaOpcoes
                      linhas={linhasFinanciamento}
                      cor="text-amber-700"
                      entrada={entradaNum}
                      mostrarTotal
                      selecionados={selFinanciamento}
                      onToggle={toggleFinanciamento}
                    />
                  )}
                </div>
                )}

                {(() => {
                  const total = selCartao.size + selDebito.size + selLink.size + selFinanciamento.size
                  return (
                    <div className="flex items-center justify-end gap-3 pt-2">
                      {total > 0 && (
                        <p className="text-xs text-slate-500">
                          {total} opção(ões) selecionada(s) serão incluídas no PDF
                        </p>
                      )}
                      <Button onClick={handlePrint} variant="outline" className="gap-2">
                        <Printer size={16} />
                        Imprimir / Salvar PDF
                      </Button>
                    </div>
                  )
                })()}
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
