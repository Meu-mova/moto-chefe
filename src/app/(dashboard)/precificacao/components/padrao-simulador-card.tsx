'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Calculator } from 'lucide-react'
import { PADROES_SIMULADOR, ROTULO_PADRAO, usaValor12x, type PadraoSimulador } from '@/lib/simulador-padrao'
import { salvarPadraoSimuladorAction } from '../actions'

const EXPLICACAO: Record<PadraoSimulador, string> = {
  taxas: 'O simulador calcula 21x e 12x pela taxa do cartão sobre o valor mínimo de cada modelo, e mostra o PIX.',
  avista_12x: 'O simulador mostra o preço PIX e o total em 12x que você digita em cada modelo, na tabela abaixo. As taxas de cartão ficam guardadas para quando você voltar ao padrão anterior.',
}

/** Padrão do simulador do grupo: duas abas que salvam ao trocar. */
export function PadraoSimuladorCard({ padrao, sem12x }: { padrao: PadraoSimulador; sem12x: number }) {
  const [escolhido, setEscolhido] = useState<PadraoSimulador>(padrao)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)

  async function trocar(novo: PadraoSimulador) {
    if (novo === escolhido || salvando) return
    const anterior = escolhido
    setEscolhido(novo)
    setErro(null)
    setSalvando(true)
    try {
      const r = await salvarPadraoSimuladorAction(novo)
      if (r.ok) {
        toast.success('Padrão do simulador salvo')
        return
      }
      setEscolhido(anterior)
      setErro(r.erro)
    } catch {
      setEscolhido(anterior)
      setErro('Não deu para salvar o padrão agora. Tente de novo.')
    } finally {
      setSalvando(false)
    }
  }

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="px-4 sm:px-6 py-4 border-b flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Calculator size={16} /> Como o simulador mostra o preço</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Vale para todas as lojas deste grupo. Salva ao trocar.</p>
        </div>
        <div role="radiogroup" aria-label="Padrão do simulador" className="flex w-full sm:w-auto gap-1 rounded-lg border bg-muted p-1">
          {PADROES_SIMULADOR.map(p => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={escolhido === p}
              disabled={salvando}
              onClick={() => trocar(p)}
              className={`flex-1 sm:flex-none min-h-9 rounded-md px-3 text-sm font-medium transition-colors disabled:opacity-60 ${escolhido === p ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {ROTULO_PADRAO[p]}
            </button>
          ))}
        </div>
      </div>
      <div className="px-4 sm:px-6 py-4 space-y-3">
        <p className="text-sm text-foreground">{EXPLICACAO[escolhido]}</p>
        {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
        {usaValor12x(escolhido) && sem12x > 0 && (
          <p className="flex gap-2 rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm text-foreground">
            <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
            {sem12x === 1
              ? '1 modelo ativo está sem valor em 12x. No simulador ele aparece só com o PIX.'
              : `${sem12x} modelos ativos estão sem valor em 12x. No simulador eles aparecem só com o PIX.`}
          </p>
        )}
      </div>
    </div>
  )
}
