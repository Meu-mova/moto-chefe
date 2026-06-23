'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Pencil, Trash2, UserPlus, Eye, EyeOff } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { criarUsuarioAction, editarUsuarioAction, excluirUsuarioAction } from '../actions'

type Loja = { id: string; nome: string }
type Usuario = {
  id: string
  nome: string
  email: string
  papel: string
  lojaId: string | null
  lojaNome: string | null
}

const PAPEIS: { value: string; label: string }[] = [
  { value: 'admin_geral',  label: 'Admin Geral' },
  { value: 'admin_socio',  label: 'Admin Sócio' },
  { value: 'aux_adm',      label: 'Aux. Administrativo' },
  { value: 'vendedor',     label: 'Vendedor' },
  { value: 'mecanico',     label: 'Mecânico' },
]

const PAPEL_CORES: Record<string, string> = {
  admin_geral: 'bg-purple-100 text-purple-800 border-purple-200',
  admin_socio: 'bg-blue-100 text-blue-800 border-blue-200',
  aux_adm:     'bg-amber-100 text-amber-800 border-amber-200',
  vendedor:    'bg-green-100 text-green-800 border-green-200',
  mecanico:    'bg-slate-100 text-slate-700 border-slate-200',
}

function SenhaInput({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) {
  const [mostrar, setMostrar] = useState(false)
  return (
    <div className="relative">
      <Input
        type={mostrar ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="pr-9"
      />
      <button
        type="button"
        onClick={() => setMostrar(v => !v)}
        className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {mostrar ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

function FormUsuario({
  inicial,
  lojas,
  onSubmit,
  onCancel,
  isEdit,
}: {
  inicial?: Partial<Usuario>
  lojas: Loja[]
  onSubmit: (dados: { nome: string; email: string; senha: string; papel: string; lojaId: string | null }) => void
  onCancel: () => void
  isEdit: boolean
}) {
  const [nome,    setNome]    = useState(inicial?.nome    ?? '')
  const [email,   setEmail]   = useState(inicial?.email   ?? '')
  const [senha,   setSenha]   = useState('')
  const [papel,   setPapel]   = useState(inicial?.papel   ?? '')
  const [lojaId,  setLojaId]  = useState(inicial?.lojaId  ?? '')

  function handleSubmit() {
    if (!nome.trim())  { toast.error('Informe o nome');  return }
    if (!email.trim()) { toast.error('Informe o e-mail'); return }
    if (!papel)        { toast.error('Selecione a função'); return }
    if (!isEdit && !senha.trim()) { toast.error('Informe a senha'); return }
    onSubmit({ nome: nome.trim(), email: email.trim(), senha, papel, lojaId: lojaId || null })
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 space-y-1.5">
          <Label>Nome completo</Label>
          <Input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: João da Silva" />
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>E-mail</Label>
          <Input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="usuario@email.com" />
        </div>
        <div className="space-y-1.5">
          <Label>{isEdit ? 'Nova senha (deixe em branco para manter)' : 'Senha'}</Label>
          <SenhaInput value={senha} onChange={setSenha} placeholder={isEdit ? 'Nova senha' : 'Mínimo 6 caracteres'} />
        </div>
        <div className="space-y-1.5">
          <Label>Função</Label>
          <Select value={papel} onValueChange={setPapel}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione a função" />
            </SelectTrigger>
            <SelectContent>
              {PAPEIS.map(p => (
                <SelectItem key={p.value} value={p.value} textValue={p.label}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="col-span-2 space-y-1.5">
          <Label>Loja</Label>
          <Select value={lojaId ?? ''} onValueChange={setLojaId}>
            <SelectTrigger>
              <SelectValue placeholder="Sem loja (Admin Geral)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="" textValue="Sem loja">— Sem loja (Admin Geral) —</SelectItem>
              {lojas.map(l => (
                <SelectItem key={l.id} value={l.id} textValue={l.nome}>{l.nome}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={onCancel}>Cancelar</Button>
        <Button onClick={handleSubmit}>{isEdit ? 'Salvar alterações' : 'Criar usuário'}</Button>
      </DialogFooter>
    </div>
  )
}

export function UsuariosTable({ usuarios, lojas }: { usuarios: Usuario[]; lojas: Loja[] }) {
  const [criando,    setCriando]    = useState(false)
  const [editando,   setEditando]   = useState<Usuario | null>(null)
  const [excluindo,  setExcluindo]  = useState<Usuario | null>(null)
  const [pending, startTransition]  = useTransition()

  function handleCriar(dados: { nome: string; email: string; senha: string; papel: string; lojaId: string | null }) {
    startTransition(async () => {
      try {
        await criarUsuarioAction(dados)
        toast.success('Usuário criado com sucesso')
        setCriando(false)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao criar usuário')
      }
    })
  }

  function handleEditar(dados: { nome: string; email: string; senha: string; papel: string; lojaId: string | null }) {
    if (!editando) return
    startTransition(async () => {
      try {
        await editarUsuarioAction(editando.id, {
          nome:      dados.nome,
          email:     dados.email,
          novaSenha: dados.senha || undefined,
          papel:     dados.papel,
          lojaId:    dados.lojaId,
        })
        toast.success('Usuário atualizado')
        setEditando(null)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao atualizar')
      }
    })
  }

  function handleExcluir() {
    if (!excluindo) return
    startTransition(async () => {
      try {
        await excluirUsuarioAction(excluindo.id)
        toast.success('Usuário excluído')
        setExcluindo(null)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
      }
    })
  }

  return (
    <>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-slate-500">{usuarios.length} usuário{usuarios.length !== 1 ? 's' : ''} cadastrado{usuarios.length !== 1 ? 's' : ''}</p>
        <Button onClick={() => setCriando(true)} className="gap-2">
          <UserPlus size={16} /> Novo usuário
        </Button>
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>E-mail</TableHead>
              <TableHead>Função</TableHead>
              <TableHead>Loja</TableHead>
              <TableHead className="text-right w-24">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {usuarios.map(u => (
              <TableRow key={u.id}>
                <TableCell className="font-medium">{u.nome}</TableCell>
                <TableCell className="text-slate-500 text-sm">{u.email}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium ${PAPEL_CORES[u.papel] ?? 'bg-slate-100 text-slate-700'}`}>
                    {PAPEIS.find(p => p.value === u.papel)?.label ?? u.papel}
                  </span>
                </TableCell>
                <TableCell className="text-slate-500">{u.lojaNome ?? <span className="text-slate-300">—</span>}</TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center gap-1 justify-end">
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-amber-600 hover:text-amber-800 hover:bg-amber-50"
                      onClick={() => setEditando(u)}
                    >
                      <Pencil size={15} />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                      onClick={() => setExcluindo(u)}
                    >
                      <Trash2 size={15} />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {usuarios.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-slate-400 py-8">
                  Nenhum usuário cadastrado.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      {/* Dialog Criar */}
      <Dialog open={criando} onOpenChange={v => { if (!pending) setCriando(v) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo usuário</DialogTitle>
          </DialogHeader>
          <FormUsuario
            lojas={lojas}
            onSubmit={handleCriar}
            onCancel={() => setCriando(false)}
            isEdit={false}
          />
        </DialogContent>
      </Dialog>

      {/* Dialog Editar */}
      <Dialog open={!!editando} onOpenChange={v => { if (!pending && !v) setEditando(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar usuário</DialogTitle>
            <p className="text-sm text-slate-500">{editando?.nome}</p>
          </DialogHeader>
          {editando && (
            <FormUsuario
              inicial={editando}
              lojas={lojas}
              onSubmit={handleEditar}
              onCancel={() => setEditando(null)}
              isEdit
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog Excluir */}
      <Dialog open={!!excluindo} onOpenChange={v => { if (!pending && !v) setExcluindo(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Excluir usuário</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-slate-600">
            Tem certeza que deseja excluir <strong>{excluindo?.nome}</strong>?
            Esta ação é irreversível e removerá o acesso ao sistema.
          </p>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setExcluindo(null)} disabled={pending}>Cancelar</Button>
            <Button variant="destructive" onClick={handleExcluir} disabled={pending}>
              {pending ? 'Excluindo…' : 'Excluir'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
