'use client'
import { useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Printer } from 'lucide-react'
import { destaqueAvista12x, type DestaqueAvista12x } from '@/lib/simulador-padrao'
import { FreteSimulador } from './frete-simulador'
import { comPaletaClara } from './simulador-client'
import { esc } from '@/lib/html'
import { fmtBRL as fmt } from '@/lib/preco-minimo'
import type { ResultadoFrete } from '../actions'

/**
 * Simulador no padrão 'avista_12x' do grupo: só PIX/dinheiro (o valor mínimo) e o total em
 * 12x digitado por modelo na Precificação, sem taxa de cartão. O padrão 'taxas' continua no
 * SimuladorClient.
 */

type Modelo = {
  id: string
  nome: string
  valorMinimo: string
  valor12x: string | null
  imagemUrl: string | null
}

type Props = {
  modelos: Modelo[]
  lojasFrete: { id: string; nome: string; temCep: boolean }[]
  isAdmin: boolean
  lojaUsuarioId: string | null
}

function gerarHtmlPrint(modelo: Modelo, d: DestaqueAvista12x, frete: { kmIdaEVolta: number; custo: number } | null) {
  const data = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
  const nomeEsc = esc(modelo.nome)
  const imgUrl = modelo.imagemUrl && /^https:\/\//i.test(modelo.imagemUrl) ? esc(modelo.imagemUrl) : null
  const blocoFrete = frete ? `
  <div style="margin-bottom:20px;padding:12px;border-radius:8px;background:var(--muted);border:1px solid var(--border)">
    <div style="font-size:11px;color:var(--muted-foreground)">Frete: ${frete.custo > 0 ? fmt(frete.custo) : 'Grátis'} (${frete.kmIdaEVolta.toFixed(1)} km ida e volta)</div>
    <div style="font-size:13px;font-weight:700;color:var(--foreground);margin-top:2px">Total com frete (PIX): ${fmt(d.pix + frete.custo)}</div>
  </div>` : ''

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <title>Simulação — ${nomeEsc}</title>
  <style>
    body{font-family:Arial,sans-serif;padding:40px;color:var(--foreground);font-size:14px;max-width:640px;margin:0 auto}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:28px;padding-bottom:16px;border-bottom:2px solid var(--border)}
    .brand{font-size:11px;color:var(--muted-foreground);margin-bottom:4px;text-transform:uppercase;letter-spacing:.05em}
    .model{font-size:26px;font-weight:700}
    .date{font-size:11px;color:var(--muted-foreground);text-align:right;white-space:nowrap}
    .price-row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:20px}
    .price-card{border-radius:12px;padding:20px 12px;text-align:center}
    .price-12x{background:color-mix(in srgb, var(--info) 10%, var(--card));border:2px solid color-mix(in srgb, var(--info) 30%, var(--card))}
    .price-pix{background:color-mix(in srgb, var(--success) 10%, var(--card));border:2px solid color-mix(in srgb, var(--success) 30%, var(--card))}
    .price-label{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;margin-bottom:8px}
    .price-val{font-size:24px;font-weight:700;margin-bottom:4px}
    .price-sub{font-size:12px}
    .price-12x .price-label,.price-12x .price-val,.price-12x .price-sub{color:var(--info)}
    .price-pix .price-label,.price-pix .price-val,.price-pix .price-sub,.price-pix .eco{color:var(--success)}
    .badge{display:inline-block;margin-top:7px;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:color-mix(in srgb, var(--success) 15%, var(--card));color:var(--success)}
    .eco{font-size:10px;margin-top:3px}
    .footer{margin-top:32px;padding-top:12px;border-top:1px solid var(--border);font-size:10px;color:var(--muted-foreground);text-align:center}
  </style>
</head>
<body>
  <div class="header">
    <div style="display:flex;align-items:center;gap:16px">
      ${imgUrl ? `<img src="${imgUrl}" alt="${nomeEsc}" style="height:72px;width:108px;object-fit:contain;border-radius:8px;background:var(--muted);border:1px solid var(--border);padding:4px">` : ''}
      <div>
        <div class="brand">MOVA — Gestão em Mobilidade Elétrica</div>
        <div class="model">${nomeEsc}</div>
      </div>
    </div>
    <div class="date">${data}</div>
  </div>

  <div class="price-row">
    <div class="price-card price-12x">
      <div class="price-label">Parcelado</div>
      <div class="price-val">${d.total12x !== null ? fmt(d.total12x) : '—'}</div>
      <div class="price-sub">${d.parcela12x !== null ? `12x de ${fmt(d.parcela12x)}` : '12x'}</div>
    </div>
    <div class="price-card price-pix">
      <div class="price-label">À vista</div>
      <div class="price-val">${fmt(d.pix)}</div>
      <div class="price-sub">PIX / Dinheiro</div>
      ${d.descontoPix ? `<div class="badge">${d.descontoPix}% de desconto</div>` : ''}
      ${d.economiaPix ? `<div class="eco">Economia de ${fmt(d.economiaPix)}</div>` : ''}
    </div>
  </div>

  ${blocoFrete}

  <div class="footer">MOVA · Simulação gerada em ${data} · Valores sujeitos a alteração sem aviso prévio</div>
</body>
</html>`
}

function Cards({ d }: { d: DestaqueAvista12x }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="rounded-xl border-2 border-info/30 bg-info/10 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-info mb-2">Parcelado</p>
        {d.total12x !== null ? (
          <>
            <p className="text-xl font-bold text-info">{fmt(d.total12x)}</p>
            <p className="text-xs text-info mt-1">12x de {fmt(d.parcela12x!)}</p>
          </>
        ) : (
          <p className="text-sm text-muted-foreground py-2">Valor em 12x não definido na Precificação</p>
        )}
      </div>
      <div className="rounded-xl border-2 border-success/30 bg-success/10 p-4 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-success mb-2">À vista</p>
        <p className="text-xl font-bold text-success">{fmt(d.pix)}</p>
        <p className="text-xs text-success mt-1">PIX / Dinheiro</p>
        {d.descontoPix && (
          <div className="mt-2 space-y-0.5">
            <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-success/10 text-success">
              {d.descontoPix}% de desconto
            </span>
            {d.economiaPix && <p className="text-[10px] font-semibold text-success">Economia de {fmt(d.economiaPix)}</p>}
          </div>
        )}
      </div>
    </div>
  )
}

export function SimuladorAvista12x({ modelos, lojasFrete, isAdmin, lojaUsuarioId }: Props) {
  const [modeloId, setModeloId] = useState('')
  const [freteResultado, setFreteResultado] = useState<ResultadoFrete | null>(null)

  const modelo = modelos.find(m => m.id === modeloId) ?? null
  const destaque = modelo
    ? destaqueAvista12x(parseFloat(modelo.valorMinimo), modelo.valor12x ? parseFloat(modelo.valor12x) : null)
    : null

  function handlePrint() {
    if (!modelo || !destaque) return
    const html = gerarHtmlPrint(modelo, destaque, freteResultado?.ok ? freteResultado : null)
    const blob = new Blob([comPaletaClara(html)], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank', 'width=780,height=960')
    win?.focus()
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  }

  return (
    <>
      <div className="bg-card rounded-xl border shadow-sm p-6">
        <div className="max-w-sm space-y-1.5">
          <Label className="text-sm font-medium text-foreground">Selecione o modelo</Label>
          <Select value={modeloId} onValueChange={v => setModeloId(v ?? '')}>
            <SelectTrigger className="h-11 text-base w-full">
              <span className={modeloId ? 'text-foreground' : 'text-muted-foreground'}>
                {modelo?.nome ?? 'Escolha um modelo...'}
              </span>
            </SelectTrigger>
            <SelectContent>
              {modelos.map(m => <SelectItem key={m.id} value={m.id}>{m.nome}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {modelo && destaque && (
        <div className="bg-card rounded-xl border shadow-sm overflow-hidden">
          <div className="border-b bg-muted flex items-center gap-5 px-6 py-4">
            {modelo.imagemUrl && (
              <img src={modelo.imagemUrl} alt={modelo.nome} className="h-24 w-36 object-contain rounded-lg bg-card border p-1 shrink-0" />
            )}
            <div>
              <h2 className="text-2xl font-bold text-foreground">{modelo.nome}</h2>
              <p className="text-sm text-muted-foreground mt-0.5">Condições de pagamento</p>
            </div>
          </div>

          <div className="p-6 space-y-6">
            <Cards d={destaque} />

            <FreteSimulador
              lojas={lojasFrete}
              isAdmin={isAdmin}
              lojaUsuarioId={lojaUsuarioId}
              onResultado={setFreteResultado}
            />

            {freteResultado?.ok && (
              <p className="text-sm font-medium text-foreground">
                Total com frete (PIX): {fmt(destaque.pix + freteResultado.custo)}
              </p>
            )}

            <div className="flex justify-end">
              <Button onClick={handlePrint} variant="outline" className="gap-2">
                <Printer size={16} />
                Imprimir / Salvar PDF
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
