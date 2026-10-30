'use client'

import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { buttonVariants } from '@/components/ui/button'
import { PecasPorPlanilha } from '../../entrada/components/pecas-por-planilha'

type Props = { lojas: { id: string; nome: string }[] }

/** O mesmo fluxo da planilha de peças da Entrada (#519), aberto a partir do catálogo. */
export function ImportarPlanilhaPecasDialog({ lojas }: Props) {
  const [aberto, setAberto] = useState(false)
  const [lojaId, setLojaId] = useState('')
  // Enquanto grava, X e Esc não fecham: a pessoa veria o resultado sumir com o diálogo.
  const [ocupado, setOcupado] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setAberto(true)}
        className={`${buttonVariants({ variant: 'outline' })} h-10 w-full gap-1.5 lg:h-9 lg:w-auto`}
      >
        <FileSpreadsheet className="size-4" /> Importar planilha
      </button>
      {/* Fechar só pelo botão: clique fora perderia a conferência inteira. */}
      <Dialog open={aberto} onOpenChange={v => { if (!ocupado) setAberto(v) }} disablePointerDismissal>
        <DialogContent className="sm:max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Importar peças e acessórios por planilha</DialogTitle>
          </DialogHeader>
          <label className="block">
            <span className="block text-sm text-muted-foreground mb-1">Loja de destino</span>
            <select
              value={lojaId}
              onChange={e => setLojaId(e.target.value)}
              className="w-full border border-input rounded-md px-3 py-2 text-sm bg-background"
            >
              <option value="">Selecione a loja...</option>
              {lojas.map(l => <option key={l.id} value={l.id}>{l.nome}</option>)}
            </select>
          </label>
          <PecasPorPlanilha
            lojaId={lojaId}
            lojaNome={lojas.find(l => l.id === lojaId)?.nome ?? 'loja'}
            onRegistrado={() => setAberto(false)}
            onOcupado={setOcupado}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
