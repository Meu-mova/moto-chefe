'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { CepInput } from '@/components/ui/cep-input'
import { Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { editarLojaAction } from '../actions'

type Loja = {
  id: string
  nome: string
  cidade: string
  endereco: string
  cep: string | null
  fabricaEmail: string | null
  fabricaSenha: string | null
}

export function EditarLojaDialog({ loja }: { loja: Loja }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [nome, setNome] = useState(loja.nome)
  const [cidade, setCidade] = useState(loja.cidade)
  const [endereco, setEndereco] = useState(loja.endereco)
  const [cep, setCep] = useState(loja.cep ?? '')
  const [fabricaEmail, setFabricaEmail] = useState(loja.fabricaEmail ?? '')
  const [fabricaSenha, setFabricaSenha] = useState(loja.fabricaSenha ?? '')

  function handleOpen() {
    setNome(loja.nome)
    setCidade(loja.cidade)
    setEndereco(loja.endereco)
    setCep(loja.cep ?? '')
    setFabricaEmail(loja.fabricaEmail ?? '')
    setFabricaSenha(loja.fabricaSenha ?? '')
    setOpen(true)
  }

  async function handleSalvar() {
    if (!nome.trim() || !cidade.trim() || !endereco.trim()) {
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
      formData.set('fabricaEmail', fabricaEmail)
      formData.set('fabricaSenha', fabricaSenha)
      const { geocodificado } = await editarLojaAction(loja.id, formData)
      if (cep.trim() && !geocodificado) {
        toast.warning('Loja atualizada, mas não foi possível localizar o CEP no mapa. O frete não poderá ser calculado até ajustar o endereço.')
      } else {
        toast.success('Loja atualizada!')
      }
      setOpen(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      <Button onClick={handleOpen} size="sm" variant="outline" className="gap-1.5">
        <Pencil size={14} /> Editar
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Editar Loja</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
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
              <CepInput value={cep} onChange={setCep} className="h-9 text-sm" />
              <p className="text-[11px] text-slate-400">Usado pra calcular frete no Simulador.</p>
            </div>
            <div className="border-t pt-3 space-y-3">
              <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Portal da fábrica</p>
              <div className="space-y-1.5">
                <Label className="text-xs">E-mail</Label>
                <Input value={fabricaEmail} onChange={e => setFabricaEmail(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Senha</Label>
                <Input type="password" value={fabricaSenha} onChange={e => setFabricaSenha(e.target.value)} className="h-9 text-sm" />
              </div>
              <p className="text-[11px] text-slate-400">
                Cada loja tem o cadastro dela no portal. Em branco, esta loja fica
                de fora da sincronização de garantias e do aviso de pedidos.
              </p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={handleSalvar} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
