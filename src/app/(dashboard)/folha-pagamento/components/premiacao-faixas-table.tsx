'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Trash2 } from 'lucide-react'
import { criarFaixaPremiacaoAction, excluirFaixaPremiacaoAction } from '../actions'
import { parseNumeroBR } from '@/lib/numero-br'

export type FaixaRow = { id: string; valorMinimoVendas: string; premiacao: string }

const fmt = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function PremiacaoFaixasTable({ faixas }: { faixas: FaixaRow[] }) {
  const [novoMinimo, setNovoMinimo] = useState('')
  const [novoPremio, setNovoPremio] = useState('')
  const [pending, startTransition] = useTransition()
  const [excluindoId, setExcluindoId] = useState<string | null>(null)

  const ordenadas = [...faixas].sort((a, b) => parseFloat(a.valorMinimoVendas) - parseFloat(b.valorMinimoVendas))

  function adicionar() {
    if (!novoMinimo.trim() || !novoPremio.trim()) {
      toast.error('Preencha os dois campos')
      return
    }
    const minimo = parseNumeroBR(novoMinimo)
    const premio = parseNumeroBR(novoPremio)
    if (minimo === null) { toast.error('Venda mínima inválida'); return }
    if (premio === null) { toast.error('Premiação inválida'); return }

    startTransition(async () => {
      try {
        await criarFaixaPremiacaoAction(minimo, premio)
        toast.success('Faixa adicionada')
        setNovoMinimo('')
        setNovoPremio('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao adicionar faixa')
      }
    })
  }

  function excluir(id: string) {
    setExcluindoId(id)
    startTransition(async () => {
      try {
        await excluirFaixaPremiacaoAction(id)
        toast.success('Faixa removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao remover')
      } finally {
        setExcluindoId(null)
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Premiação mensal do vendedor de acordo com o valor total vendido no mês (motos). Aplica-se a faixa de maior
        valor mínimo que ele atingiu.
      </p>
      <div className="bg-card border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b">
            <tr>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Venda mínima no mês</th>
              <th className="text-left px-4 py-2 text-xs font-medium text-muted-foreground">Premiação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {ordenadas.map(f => (
              <tr key={f.id} className="hover:bg-muted">
                <td className="px-4 py-2">{fmt(f.valorMinimoVendas)}</td>
                <td className="px-4 py-2 font-medium">{fmt(f.premiacao)}</td>
                <td className="px-4 py-2 text-right">
                  <button
                    onClick={() => excluir(f.id)}
                    disabled={pending && excluindoId === f.id}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {ordenadas.length === 0 && (
              <tr><td colSpan={3} className="text-center text-muted-foreground py-6">Nenhuma faixa cadastrada.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-end gap-2 bg-card border rounded-lg p-3">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Venda mínima (R$)</label>
          <Input value={novoMinimo} onChange={e => setNovoMinimo(e.target.value)} className="h-8 text-xs w-36" placeholder="0,00" />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">Premiação (R$)</label>
          <Input value={novoPremio} onChange={e => setNovoPremio(e.target.value)} className="h-8 text-xs w-36" placeholder="0,00" />
        </div>
        <Button size="sm" className="h-8 text-xs" disabled={pending} onClick={adicionar}>
          Adicionar faixa
        </Button>
      </div>
    </div>
  )
}
