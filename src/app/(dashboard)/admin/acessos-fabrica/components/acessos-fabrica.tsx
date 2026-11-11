'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { SENHA_MINIMA_FABRICA, validarAcessoFabrica, validarSenhaFabrica } from '@/lib/acessos-fabrica'
import { alternarAcessoFabricaAction, criarAcessoFabricaAction, redefinirSenhaFabricaAction } from '../actions'

type Acesso = { id: string; nome: string; email: string; ativo: boolean }

export function AcessosFabrica({ acessos }: { acessos: Acesso[] }) {
  const [enviando, iniciar] = useTransition()
  const [novo, setNovo] = useState({ nome: '', email: '', senha: '' })
  const [senhaDe, setSenhaDe] = useState<string | null>(null)
  const [novaSenha, setNovaSenha] = useState('')

  const criar = () => {
    const v = validarAcessoFabrica(novo)
    if (!v.ok) { toast.error(v.erro); return }
    iniciar(async () => {
      const r = await criarAcessoFabricaAction(v.dados)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success(`Acesso criado. Passe à fábrica o e-mail ${v.dados.email} e a senha definida.`)
      setNovo({ nome: '', email: '', senha: '' })
    })
  }

  const alternar = (a: Acesso) => iniciar(async () => {
    const r = await alternarAcessoFabricaAction(a.id, !a.ativo)
    if (!r.ok) toast.error(r.erro)
    else toast.success(a.ativo ? `${a.nome} não entra mais` : `${a.nome} voltou a entrar`)
  })

  const trocarSenha = (a: Acesso) => {
    const erro = validarSenhaFabrica(novaSenha)
    if (erro) { toast.error(erro); return }
    iniciar(async () => {
      const r = await redefinirSenhaFabricaAction(a.id, novaSenha)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success(`Senha de ${a.nome} trocada`)
      setSenhaDe(null)
      setNovaSenha('')
    })
  }

  return (
    <div className="space-y-6">
      <form
        className="bg-card border rounded-lg p-4 grid gap-3 sm:grid-cols-3"
        onSubmit={e => { e.preventDefault(); criar() }}
      >
        <div className="space-y-1">
          <Label htmlFor="fab-nome">Nome</Label>
          <Input id="fab-nome" value={novo.nome} onChange={e => setNovo(p => ({ ...p, nome: e.target.value }))} placeholder="Fábrica — Comercial" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fab-email">E-mail (login)</Label>
          <Input id="fab-email" type="email" value={novo.email} onChange={e => setNovo(p => ({ ...p, email: e.target.value }))} autoComplete="off" />
        </div>
        <div className="space-y-1">
          <Label htmlFor="fab-senha">Senha</Label>
          <Input id="fab-senha" type="password" value={novo.senha} onChange={e => setNovo(p => ({ ...p, senha: e.target.value }))} autoComplete="new-password" placeholder={`Mín. ${SENHA_MINIMA_FABRICA} caracteres`} />
        </div>
        <div className="sm:col-span-3 flex justify-end">
          <Button type="submit" disabled={enviando}>{enviando ? 'Salvando…' : 'Criar acesso'}</Button>
        </div>
      </form>

      <div className="bg-card border rounded-lg divide-y">
        {acessos.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhum acesso da fábrica ainda.</p>}
        {acessos.map(a => (
          <div key={a.id} className="p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium">{a.nome} {!a.ativo && <span className="text-xs text-muted-foreground">(desativado)</span>}</p>
                <p className="text-sm text-muted-foreground break-all">{a.email}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={enviando} onClick={() => { setSenhaDe(senhaDe === a.id ? null : a.id); setNovaSenha('') }}>
                  Trocar senha
                </Button>
                <Button variant="outline" size="sm" disabled={enviando} onClick={() => alternar(a)}>
                  {a.ativo ? 'Desativar' : 'Reativar'}
                </Button>
              </div>
            </div>
            {senhaDe === a.id && (
              <form className="flex flex-wrap items-end gap-2" onSubmit={e => { e.preventDefault(); trocarSenha(a) }}>
                <div className="space-y-1">
                  <Label htmlFor={`senha-${a.id}`}>Nova senha</Label>
                  <Input id={`senha-${a.id}`} type="password" value={novaSenha} onChange={e => setNovaSenha(e.target.value)} autoComplete="new-password" />
                </div>
                <Button type="submit" size="sm" disabled={enviando}>Salvar senha</Button>
              </form>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
