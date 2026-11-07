'use client'

import { useState } from 'react'
import { Archive, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { ArquivarMotoDialog } from './arquivar-moto-dialog'

/** Menu "Mais ações" do topo do Showroom (#688). A página só o mostra para quem pode arquivar. */
export function MaisAcoesShowroom() {
  const [aberto, setAberto] = useState(false)
  // Diálogo novo a cada abertura. Fica fora do menu, que desmonta o conteúdo ao fechar, e a chave não
  // muda com o revalidatePath da action: a tela de concluído continua até a pessoa fechar.
  const [vez, setVez] = useState(0)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="outline" size="sm" className="gap-2" />}>
          Mais ações <ChevronDown size={14} />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuItem onClick={() => { setVez(v => v + 1); setAberto(true) }}>
            <Archive />
            <span>Arquivar moto<span className="block text-xs text-muted-foreground">Esconde sem apagar</span></span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ArquivarMotoDialog key={vez} aberto={aberto} onFechar={() => setAberto(false)} />
    </>
  )
}
