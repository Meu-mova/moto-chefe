'use client'
import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TIPOS_CHAVE_PIX, type TipoChavePix } from '@/lib/dados-funcionario'
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

  function abrir(v: boolean) {
    // Reabrir parte do que está gravado, não do que foi digitado e cancelado.
    if (v) { setTipo(pixTipo); setChave(pixChave); setErro(null) }
    setOpen(v)
  }

  async function salvar() {
    setSalvando(true)
    setErro(null)
    const r = await salvarPixDoFuncionarioAction(usuarioId, tipo, chave)
    setSalvando(false)
    if (r.ok) setOpen(false)
    else setErro(r.erro)
  }

  return (
    <>
    <Button variant="ghost" size="icon" aria-label={`Editar PIX de ${nome}`} onClick={() => abrir(true)}>
      <Pencil className="size-4" />
    </Button>
    <Dialog open={open} onOpenChange={abrir}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Chave PIX de {nome}</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`pixTipo-${usuarioId}`}>Tipo da chave</Label>
          {/* <select> nativo: o <Select> do base-ui mostra o value cru ("cpf"). */}
          <select id={`pixTipo-${usuarioId}`} value={tipo}
                  onChange={e => setTipo(e.target.value as TipoChavePix)}
                  className="h-9 rounded-md border border-input bg-transparent px-3 text-sm">
            {TIPOS_CHAVE_PIX.map(t => <option key={t.valor} value={t.valor}>{t.rotulo}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`pixChave-${usuarioId}`}>Chave PIX</Label>
          <Input id={`pixChave-${usuarioId}`} value={chave} onChange={e => setChave(e.target.value)} />
        </div>

        {erro && <p className="text-sm text-destructive">{erro}</p>}

        <DialogFooter>
          <Button onClick={salvar} disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar'}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
