'use client'

import { useState } from 'react'
import { Archive, ChevronDown, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArquivarMotoDialog } from './arquivar-moto-dialog'
import { RemoverMotoDialog } from './remover-moto-dialog'

/** Menu "Mais ações" do topo do Showroom (#688, #692). Cada item pela mesma regra do servidor dele. */
export function MaisAcoesShowroom({ podeArquivar, podeRemover }: { podeArquivar: boolean; podeRemover: boolean }) {
  const [aberto, setAberto] = useState<'arquivar' | 'remover' | null>(null)
  // Diálogo novo a cada abertura. Fica fora do menu, que desmonta o conteúdo ao fechar, e a chave não
  // muda com o revalidatePath da action: a tela de concluído continua até a pessoa fechar.
  const [vez, setVez] = useState(0)
  const abrir = (qual: 'arquivar' | 'remover') => { setVez(v => v + 1); setAberto(qual) }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
          Mais ações <ChevronDown size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          {podeArquivar && (
            <DropdownMenuItem onClick={() => abrir('arquivar')}>
              <Archive />
              <span>Arquivar moto<span className="block text-xs text-muted-foreground">Esconde sem apagar</span></span>
            </DropdownMenuItem>
          )}
          {podeRemover && (
            <DropdownMenuItem variant="destructive" onClick={() => abrir('remover')}>
              <Trash2 />
              <span>Remover moto<span className="block text-xs text-muted-foreground">Apaga de vez</span></span>
            </DropdownMenuItem>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <ArquivarMotoDialog key={`a${vez}`} aberto={aberto === 'arquivar'} onFechar={() => setAberto(null)} />
      <RemoverMotoDialog key={`r${vez}`} aberto={aberto === 'remover'} onFechar={() => setAberto(null)} />
    </>
  )
}
