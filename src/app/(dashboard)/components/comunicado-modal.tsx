'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { marcarComoLidoAction } from '@/app/(dashboard)/admin/comunicados/actions'

type Comunicado = { id: string; titulo: string; conteudo: string }

export function ComunicadoModal({ comunicados }: { comunicados: Comunicado[] }) {
  const [indice, setIndice] = useState(0)
  const [aberto, setAberto] = useState(comunicados.length > 0)
  const [loading, setLoading] = useState(false)

  if (!aberto || comunicados.length === 0) return null

  const atual = comunicados[indice]

  async function handleLido() {
    setLoading(true)
    await marcarComoLidoAction(atual.id)
    if (indice + 1 < comunicados.length) {
      setIndice(i => i + 1)
    } else {
      setAberto(false)
    }
    setLoading(false)
  }

  return (
    <Dialog open={aberto} onOpenChange={() => {}} disablePointerDismissal>
      <DialogContent className="max-w-lg" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle className="text-lg">{atual.titulo}</DialogTitle>
          {comunicados.length > 1 && (
            <p className="text-xs text-muted-foreground mt-1">{indice + 1} de {comunicados.length}</p>
          )}
        </DialogHeader>
        <div className="max-h-72 overflow-y-auto text-sm text-foreground whitespace-pre-wrap py-2 leading-relaxed">
          {atual.conteudo}
        </div>
        <DialogFooter>
          <Button onClick={handleLido} disabled={loading} className="w-full sm:w-auto">
            {loading ? 'Registrando...' : 'LIDO'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
