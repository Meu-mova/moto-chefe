'use client'
import { useRef, useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { CamposPix } from '@/components/campos-pix'
import type { TipoChavePix } from '@/lib/dados-funcionario'
import { FALHA_SEM_RESPOSTA } from '@/lib/falha-sem-resposta'
import { salvarPixDoFuncionarioAction } from '../actions'

export function EditarPixDialog({ usuarioId, nome, pixTipo, pixChave }: {
  usuarioId: string
  nome: string
  pixTipo: TipoChavePix
  pixChave: string
}) {
  const [open, setOpen] = useState(false)
  const [tipo, setTipo] = useState<TipoChavePix>(pixTipo)
  const [chave, setChave] = useState(pixChave)
  const [erro, setErro] = useState<string | null>(null)
  const [salvando, setSalvando] = useState(false)
  // O estado só muda no próximo render; o ref barra o segundo clique que chega antes dele.
  const enviando = useRef(false)

  function abrir() {
    // Reabrir parte do que está gravado, não do que foi digitado e cancelado.
    setTipo(pixTipo); setChave(pixChave); setErro(null)
    setOpen(true)
  }

  function fechar() {
    if (!enviando.current) setOpen(false)
  }

  async function salvar() {
    if (enviando.current) return
    enviando.current = true
    setSalvando(true)
    setErro(null)
    try {
      const r = await salvarPixDoFuncionarioAction(usuarioId, tipo, chave)
      if (r.ok) setOpen(false)
      else setErro(r.erro)
    } catch {
      setErro(FALHA_SEM_RESPOSTA)
    } finally {
      enviando.current = false
      setSalvando(false)
    }
  }

  return (
    <>
      <Button variant="ghost" size="icon" aria-label={`Editar PIX de ${nome}`} onClick={abrir}>
        <Pencil className="size-4" />
      </Button>
      <Dialog open={open} onOpenChange={aberto => { if (!aberto) fechar() }} disablePointerDismissal>
        <DialogContent className="sm:max-w-sm" showCloseButton={!salvando}>
          <DialogHeader>
            <DialogTitle>Chave PIX de {nome}</DialogTitle>
          </DialogHeader>

          <CamposPix id={`pix-${usuarioId}`} tipo={tipo} chave={chave} onTipo={setTipo} onChave={setChave} />

          {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}

          <DialogFooter>
            <Button variant="outline" disabled={salvando} onClick={fechar}>Cancelar</Button>
            <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
