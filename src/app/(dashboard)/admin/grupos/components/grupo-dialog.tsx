'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Plus, Pencil } from 'lucide-react'
import { toast } from 'sonner'
import { criarGrupoAction, editarGrupoAction } from '../actions'

type Grupo = {
  id: string
  nome: string
  cnpj: string
  ativo: boolean
  validapixEmail: string | null
  validapixPassword: string | null
  fabricaEmail: string | null
  fabricaSenha: string | null
  blingClientId: string | null
  blingClientSecret: string | null
  telegramChatId: string | null
}

type Props = {
  modo: 'criar' | 'editar'
  inicial?: Grupo
  open?: boolean
  onOpenChange?: (v: boolean) => void
}

export function GrupoDialog({ modo, inicial, open, onOpenChange }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [nome, setNome] = useState(inicial?.nome ?? '')
  const [cnpj, setCnpj] = useState(inicial?.cnpj ?? '')
  const [ativo, setAtivo] = useState(inicial?.ativo ?? true)
  const [validapixEmail, setValidapixEmail] = useState(inicial?.validapixEmail ?? '')
  const [validapixPassword, setValidapixPassword] = useState(inicial?.validapixPassword ?? '')
  const [fabricaEmail, setFabricaEmail] = useState(inicial?.fabricaEmail ?? '')
  const [fabricaSenha, setFabricaSenha] = useState(inicial?.fabricaSenha ?? '')
  const [blingClientId, setBlingClientId] = useState(inicial?.blingClientId ?? '')
  const [blingClientSecret, setBlingClientSecret] = useState(inicial?.blingClientSecret ?? '')
  const [telegramChatId, setTelegramChatId] = useState(inicial?.telegramChatId ?? '')

  async function handleSalvar() {
    if (!nome.trim() || !cnpj.trim()) {
      toast.error('Preencha nome e CNPJ')
      return
    }
    setLoading(true)
    try {
      const dados = { nome, cnpj, ativo, validapixEmail, validapixPassword, fabricaEmail, fabricaSenha, blingClientId, blingClientSecret, telegramChatId }
      if (modo === 'criar') {
        await criarGrupoAction(dados)
        toast.success('Grupo criado!')
      } else {
        await editarGrupoAction(inicial!.id, dados)
        toast.success('Grupo atualizado!')
      }
      onOpenChange?.(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{modo === 'criar' ? 'Novo Grupo' : 'Editar Grupo'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Nome *</Label>
            <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: BH" className="h-9 text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">CNPJ *</Label>
            <Input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" className="h-9 text-sm" />
          </div>

          <div className="border-t pt-3 space-y-3">
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">Integrações (opcional)</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">ValidaPix — E-mail</Label>
                <Input value={validapixEmail} onChange={e => setValidapixEmail(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">ValidaPix — Senha</Label>
                <Input type="password" value={validapixPassword} onChange={e => setValidapixPassword(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fábrica — E-mail</Label>
                <Input value={fabricaEmail} onChange={e => setFabricaEmail(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Fábrica — Senha</Label>
                <Input type="password" value={fabricaSenha} onChange={e => setFabricaSenha(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Bling — Client ID</Label>
                <Input value={blingClientId} onChange={e => setBlingClientId(e.target.value)} className="h-9 text-sm" />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Bling — Client Secret</Label>
                <Input type="password" value={blingClientSecret} onChange={e => setBlingClientSecret(e.target.value)} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Telegram — Chat do grupo de avisos</Label>
              <Input
                value={telegramChatId}
                onChange={e => setTelegramChatId(e.target.value)}
                placeholder="-1001234567890"
                className="h-9 text-sm"
              />
              <p className="text-[11px] text-slate-400">
                Crie um grupo no Telegram, adicione o @MovaMC_bot e envie <code>/chatid</code> lá — ele
                responde o número para colar aqui. Em branco, esta bandeira não recebe avisos.
              </p>
            </div>
            <p className="text-xs text-slate-400">
              ValidaPix e Fábrica ainda não são usadas pelo sistema — serão ativadas em uma etapa futura. Bling já está em uso (emissão de NF-e).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input type="checkbox" id="ativo" checked={ativo} onChange={e => setAtivo(e.target.checked)} />
            <Label htmlFor="ativo" className="text-xs">Grupo ativo</Label>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => onOpenChange?.(false)}>Cancelar</Button>
          <Button onClick={handleSalvar} disabled={loading}>
            {loading ? 'Salvando...' : modo === 'criar' ? 'Criar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

export function NovoGrupoButton() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="gap-1.5">
        <Plus size={15} /> Novo Grupo
      </Button>
      <GrupoDialog modo="criar" open={open} onOpenChange={setOpen} />
    </>
  )
}

export function EditarGrupoButton({ grupo }: { grupo: Grupo }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="text-slate-400 hover:text-slate-700 p-1" title="Editar">
        <Pencil size={14} />
      </button>
      <GrupoDialog key={grupo.id} modo="editar" inicial={grupo} open={open} onOpenChange={setOpen} />
    </>
  )
}
