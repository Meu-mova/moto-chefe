'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Power } from 'lucide-react'
import { criarBeneficiarioAction, alternarBeneficiarioAtivoAction } from '@/app/(dashboard)/despesas/actions'

export type BeneficiarioRow = { id: string; nome: string; ativo: boolean }

export function BeneficiariosTable({ beneficiarios }: { beneficiarios: BeneficiarioRow[] }) {
  const [nome, setNome] = useState('')
  const [pending, start] = useTransition()

  function criar() {
    start(async () => {
      try {
        await criarBeneficiarioAction(nome)
        toast.success('Beneficiário cadastrado')
        setNome('')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao cadastrar')
      }
    })
  }

  function alternar(b: BeneficiarioRow) {
    start(async () => {
      try {
        await alternarBeneficiarioAtivoAction(b.id, !b.ativo)
        toast.success(b.ativo ? 'Beneficiário desativado' : 'Beneficiário reativado')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao alterar')
      }
    })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        A quem se destinam as retiradas e o pró-labore. Aparecem na hora de lançar a despesa nas categorias marcadas
        com <strong>exige beneficiário</strong>. A lista é <strong>por grupo</strong> — cada bandeira tem seus sócios.
      </p>

      <div className="overflow-hidden rounded-lg border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Nome</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-muted-foreground">Situação</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {beneficiarios.map(b => (
              <tr key={b.id} className={`hover:bg-muted ${b.ativo ? '' : 'text-muted-foreground'}`}>
                <td className="px-4 py-2 font-medium">{b.nome}</td>
                <td className="px-4 py-2 text-xs">{b.ativo ? 'Ativo' : 'Desativado'}</td>
                <td className="px-4 py-2 text-right">
                  {/* Liga e desliga, nunca apaga: a despesa guarda o NOME, e sumir
                      do catálogo deixaria lançamentos antigos apontando para
                      alguém que a tela não sabe mais listar. */}
                  <button
                    onClick={() => alternar(b)}
                    disabled={pending}
                    title={b.ativo ? 'Desativar' : 'Reativar'}
                    className="text-muted-foreground hover:text-warning"
                  >
                    <Power size={14} />
                  </button>
                </td>
              </tr>
            ))}
            {beneficiarios.length === 0 && (
              <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Nenhum beneficiário cadastrado.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-end gap-2 rounded-lg border bg-card p-3">
        <div className="flex-1 space-y-1">
          <label className="text-xs text-muted-foreground">Nome</label>
          <Input value={nome} onChange={e => setNome(e.target.value)} className="h-8 text-xs" placeholder="Ex.: Cesar" />
        </div>
        <Button size="sm" className="h-8 text-xs" disabled={pending || !nome.trim()} onClick={criar}>
          Cadastrar
        </Button>
      </div>
    </div>
  )
}
