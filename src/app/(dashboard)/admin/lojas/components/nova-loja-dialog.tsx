'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Plus } from 'lucide-react'
import { toast } from 'sonner'
import { criarLojaAction } from '../actions'

type Grupo = { id: string; nome: string }

export function NovaLojaDialog({ grupos, grupoIdDefault }: { grupos: Grupo[]; grupoIdDefault: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nome, setNome] = useState('')
  const [cidade, setCidade] = useState('')
  const [endereco, setEndereco] = useState('')
  const [cep, setCep] = useState('')
  const [grupoId, setGrupoId] = useState(grupoIdDefault)

  async function handleSalvar() {
    if (!nome.trim() || !cidade.trim() || !endereco.trim() || !grupoId) {
      toast.error('Preencha todos os campos')
      return
    }
    setLoading(true)
    try {
      const formData = new FormData()
      formData.set('nome', nome)
      formData.set('cidade', cidade)
      formData.set('endereco', endereco)
      formData.set('cep', cep)
      formData.set('grupoId', grupoId)
      await criarLojaAction(formData)
      toast.success('Loja criada!')
      setOpen(false)
      setNome(''); setCidade(''); setEndereco(''); setCep('')
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Nova Loja
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nova Loja</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Grupo *</Label>
              <select
                value={grupoId}
                onChange={e => setGrupoId(e.target.value)}
                className="h-9 w-full rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none"
              >
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Nome *</Label>
              <Input value={nome} onChange={e => setNome(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Cidade *</Label>
              <Input value={cidade} onChange={e => setCidade(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Endereço *</Label>
              <Input value={endereco} onChange={e => setEndereco(e.target.value)} className="h-9 text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">CEP</Label>
              <Input
                value={cep}
                onChange={e => setCep(e.target.value)}
                className="h-9 text-sm"
                placeholder="00000-000"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={loading}>{loading ? 'Salvando...' : 'Criar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
