'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Calculator } from 'lucide-react'
import { PADROES_SIMULADOR, ROTULO_PADRAO, type PadraoSimulador } from '@/lib/simulador-padrao'
import { salvarPadraoSimuladorAction } from '../actions'

const EXPLICACAO: Record<PadraoSimulador, string> = {
  taxas: 'Três cards: 21x e 12x calculados pela taxa do cartão sobre o valor mínimo, e PIX/dinheiro. Abaixo, as tabelas de cartão, débito e link.',
  avista_12x: 'Dois cards: PIX/dinheiro (o valor mínimo) e o total em 12x digitado em cada modelo, sem taxa de cartão.',
}

export function PadraoSimuladorCard({ padrao }: { padrao: PadraoSimulador }) {
  const [escolhido, setEscolhido] = useState<PadraoSimulador>(padrao)
  const [pendente, iniciar] = useTransition()
  const salvar = () => iniciar(async () => {
    const r = await salvarPadraoSimuladorAction(escolhido)
    if (r.ok) toast.success('Padrão do simulador salvo')
    else toast.error(r.erro)
  })

  return (
    <div className="bg-card rounded-xl border shadow-sm">
      <div className="px-6 py-4 border-b flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-foreground flex items-center gap-2"><Calculator size={16} /> Padrão do Simulador</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Vale para todas as lojas deste grupo</p>
        </div>
        <Button onClick={salvar} disabled={pendente || escolhido === padrao}>
          {pendente ? 'Salvando...' : 'Salvar padrão'}
        </Button>
      </div>
      <div className="p-6 grid gap-3 sm:grid-cols-2">
        {PADROES_SIMULADOR.map(p => (
          <label
            key={p}
            className={`rounded-lg border p-4 cursor-pointer space-y-1 ${escolhido === p ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'}`}
          >
            <span className="flex items-center gap-2 font-medium text-sm text-foreground">
              <input
                type="radio" name="padrao-simulador" value={p} checked={escolhido === p}
                onChange={() => setEscolhido(p)} className="accent-primary"
              />
              {ROTULO_PADRAO[p]}
            </span>
            <span className="block text-xs text-muted-foreground">{EXPLICACAO[p]}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
