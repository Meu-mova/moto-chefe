'use client'
import { useMemo, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { TrendingUp, Trophy, HandCoins, Wallet } from 'lucide-react'
import { calcularPremiacao } from '@/lib/premiacao'

type Faixa = { valorMinimoVendas: string; premiacao: string }

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function SimuladorComissaoOTE({
  faixas,
  comissaoPercentual,
  valorInicial,
}: {
  faixas: Faixa[]
  comissaoPercentual: number
  valorInicial: number
}) {
  const ordenadas = useMemo(
    () => [...faixas].sort((a, b) => parseFloat(a.valorMinimoVendas) - parseFloat(b.valorMinimoVendas)),
    [faixas],
  )
  const maiorFaixa = ordenadas.length > 0 ? parseFloat(ordenadas[ordenadas.length - 1].valorMinimoVendas) : 0
  const max = Math.max(Math.ceil((maiorFaixa * 1.2) / 10000) * 10000, 100000)
  const step = 1000

  const [valor, setValor] = useState(() => {
    const inicial = Math.round(valorInicial / step) * step
    return Math.min(Math.max(inicial, 0), max)
  })

  const comissao = valor * (comissaoPercentual / 100)
  const premiacao = calcularPremiacao(valor, ordenadas)
  const total = comissao + premiacao

  const proximaFaixa = ordenadas.find(f => parseFloat(f.valorMinimoVendas) > valor)
  const faltamParaProxima = proximaFaixa ? parseFloat(proximaFaixa.valorMinimoVendas) - valor : null

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-slate-700">Simulador de Ganhos</h3>
          <p className="text-xs text-slate-400">Arraste para simular o total de vendas no mês e veja sua comissão + premiação OTE</p>
        </div>
        <TrendingUp size={18} className="text-emerald-500 shrink-0" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-slate-500">Valor de vendas simulado</span>
          <span className="text-lg font-bold text-slate-800">{fmt(valor)}</span>
        </div>
        <Slider
          min={0}
          max={max}
          step={step}
          value={valor}
          onValueChange={(v) => setValor(v as number)}
        />
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          <span>R$ 0</span>
          <span>{fmt(max)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-slate-50 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-500">
            <HandCoins size={13} />
            <span className="text-[11px]">Comissão ({comissaoPercentual}%)</span>
          </div>
          <p className="text-sm font-semibold text-slate-800">{fmt(comissao)}</p>
        </div>
        <div className="bg-slate-50 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-slate-500">
            <Trophy size={13} />
            <span className="text-[11px]">Premiação OTE</span>
          </div>
          <p className="text-sm font-semibold text-slate-800">{fmt(premiacao)}</p>
        </div>
        <div className="bg-emerald-50 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-emerald-700">
            <Wallet size={13} />
            <span className="text-[11px]">Total estimado</span>
          </div>
          <p className="text-sm font-semibold text-emerald-700">{fmt(total)}</p>
        </div>
      </div>

      {proximaFaixa && faltamParaProxima != null && (
        <p className="text-xs text-slate-500 bg-amber-50 border border-amber-100 rounded-lg px-3 py-2">
          Faltam <span className="font-semibold text-amber-700">{fmt(faltamParaProxima)}</span> em vendas para subir a
          premiação para <span className="font-semibold text-amber-700">{fmt(parseFloat(proximaFaixa.premiacao))}</span>.
        </p>
      )}
    </div>
  )
}
