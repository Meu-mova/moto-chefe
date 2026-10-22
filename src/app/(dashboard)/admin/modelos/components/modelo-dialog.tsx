'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { criarModeloAction, editarModeloAction } from '../actions'

const CATEGORIAS = ['autopropelido', 'ciclomotor', 'triciclo', 'bike', 'brinquedo', 'patinete'] as const

export type ModeloEditavel = {
  id: string
  marca: string
  modelo: string
  categoria: string
  potenciaW: string
}

export function ModeloDialog({ modelo, onClose }: { modelo?: ModeloEditavel | null; onClose: () => void }) {
  const [marca, setMarca] = useState(modelo?.marca ?? '')
  const [nome, setNome] = useState(modelo?.modelo ?? '')
  const [categoria, setCategoria] = useState(modelo?.categoria ?? 'autopropelido')
  const [potencia, setPotencia] = useState(modelo?.potenciaW ?? '')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!marca.trim() || !nome.trim() || !potencia.trim()) {
      toast.error('Preencha marca, modelo e potência')
      return
    }
    setLoading(true)
    try {
      const fd = new FormData()
      fd.set('marca', marca.trim())
      fd.set('modelo', nome.trim())
      fd.set('categoria', categoria)
      fd.set('potencia_w', potencia.trim())
      const { aviso } = modelo ? await editarModeloAction(modelo.id, fd) : await criarModeloAction(fd)
      // Nome repetido avisa e deixa gravar.
      if (aviso) toast.warning(aviso)
      else toast.success(modelo ? 'Modelo atualizado' : 'Modelo criado')
      onClose()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modelo ? 'Editar Modelo' : 'Novo Modelo'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Marca *</Label>
              <Input value={marca} onChange={e => setMarca(e.target.value)} placeholder="Ex: MotoChefe" autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: JETMAX PRO" />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Categoria *</Label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className="w-full border border-slate-200 rounded-md px-3 py-2 text-sm bg-white"
            >
              {CATEGORIAS.map(c => (
                <option key={c} value={c}>{c[0].toUpperCase() + c.slice(1)}</option>
              ))}
            </select>
          </div>
          <div className="space-y-1.5">
            <Label>Potência (W) *</Label>
            <Input value={potencia} onChange={e => setPotencia(e.target.value)} placeholder="Ex: 1000" inputMode="numeric" />
          </div>
          <p className="text-xs text-slate-400">
            O número do motor não é do modelo — cada moto recebe o seu na importação do XML.
          </p>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : modelo ? 'Salvar' : 'Criar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
