'use client'
import { useMemo, useState } from 'react'
import { Slider } from '@/components/ui/slider'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TrendingUp, Trophy, HandCoins, Wallet, Table2 } from 'lucide-react'
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
  const [tabelaAberta, setTabelaAberta] = useState(false)

  const comissao = valor * (comissaoPercentual / 100)
  const premiacao = calcularPremiacao(valor, ordenadas)
  const total = comissao + premiacao

  const proximaFaixa = ordenadas.find(f => parseFloat(f.valorMinimoVendas) > valor)
  const faltamParaProxima = proximaFaixa ? parseFloat(proximaFaixa.valorMinimoVendas) - valor : null

  return (
    <div className="bg-card rounded-lg border p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">Simulador de Ganhos</h3>
          <p className="text-xs text-muted-foreground">Arraste para simular o total de vendas no mês e veja sua comissão + premiação OTE</p>
          <button
            onClick={() => setTabelaAberta(true)}
            className="mt-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
          >
            <Table2 size={12} />
            Ver tabela completa
          </button>
        </div>
        <TrendingUp size={18} className="text-success shrink-0" />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Valor de vendas simulado</span>
          <span className="text-lg font-bold text-foreground">{fmt(valor)}</span>
        </div>
        <Slider
          min={0}
          max={max}
          step={step}
          value={valor}
          onValueChange={(v) => setValor(v as number)}
        />
        <div className="flex items-center justify-between text-[10px] text-muted-foreground">
          <span>R$ 0</span>
          <span>{fmt(max)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <HandCoins size={13} />
            <span className="text-[11px]">Comissão ({comissaoPercentual}%)</span>
          </div>
          <p className="text-sm font-semibold text-foreground">{fmt(comissao)}</p>
        </div>
        <div className="bg-muted rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Trophy size={13} />
            <span className="text-[11px]">Premiação OTE</span>
          </div>
          <p className="text-sm font-semibold text-foreground">{fmt(premiacao)}</p>
        </div>
        <div className="bg-success/10 rounded-lg p-3 space-y-1">
          <div className="flex items-center gap-1.5 text-success">
            <Wallet size={13} />
            <span className="text-[11px]">Total estimado</span>
          </div>
          <p className="text-sm font-semibold text-success">{fmt(total)}</p>
        </div>
      </div>

      {proximaFaixa && faltamParaProxima != null && (
        <p className="text-xs text-muted-foreground bg-warning/10 border border-warning/30 rounded-lg px-3 py-2">
          Faltam <span className="font-semibold text-warning">{fmt(faltamParaProxima)}</span> em vendas para subir a
          premiação para <span className="font-semibold text-warning">{fmt(parseFloat(proximaFaixa.premiacao))}</span>.
        </p>
      )}

      <Dialog open={tabelaAberta} onOpenChange={setTabelaAberta}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Tabela de Premiação OTE</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            Premiação mensal do vendedor de acordo com o valor total vendido no mês (motos). Aplica-se a faixa de
            maior valor mínimo que ele atingiu.
          </p>
          <div className="bg-card border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted border-b">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Venda mínima no mês</th>
                  <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Premiação</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {ordenadas.map((f, i) => (
                  <tr key={i} className="hover:bg-muted">
                    <td className="px-4 py-2">{fmt(parseFloat(f.valorMinimoVendas))}</td>
                    <td className="px-4 py-2 font-medium">{fmt(parseFloat(f.premiacao))}</td>
                  </tr>
                ))}
                {ordenadas.length === 0 && (
                  <tr><td colSpan={2} className="text-center text-muted-foreground py-6">Nenhuma faixa cadastrada.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
