'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { salvarConfigFuncionarioAction } from '../actions'

export type FuncionarioRow = {
  usuarioId: string
  nome: string
  papel: string
  lojaNome: string
  salario: string
  comissaoPercentual: string
  ajudaCusto: string | null
  ativo: boolean
}

const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Admin Geral',
  admin_socio: 'Admin Sócio',
  aux_adm:     'Auxiliar Adm.',
  vendedor:    'Vendedor',
  mecanico:    'Mecânico',
}

const PAPEL_COM_COMISSAO = new Set(['vendedor', 'mecanico', 'aux_adm'])

function LinhaFuncionario({ f }: { f: FuncionarioRow }) {
  const [salario, setSalario] = useState(f.salario)
  const [comissao, setComissao] = useState(f.comissaoPercentual)
  const [ajudaCusto, setAjudaCusto] = useState(f.ajudaCusto ?? '')
  const [ativo, setAtivo] = useState(f.ativo)
  const [pending, startTransition] = useTransition()

  function parseNum(v: string): number {
    const n = parseFloat(v.trim().replace(/\./g, '').replace(',', '.'))
    return isNaN(n) ? 0 : n
  }

  function salvar() {
    startTransition(async () => {
      try {
        await salvarConfigFuncionarioAction(f.usuarioId, {
          salario: parseNum(salario),
          comissaoPercentual: parseNum(comissao),
          ajudaCusto: ajudaCusto.trim() ? parseNum(ajudaCusto) : null,
          ativo,
        })
        toast.success(`Configuração de ${f.nome} salva`)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
      }
    })
  }

  const temComissao = PAPEL_COM_COMISSAO.has(f.papel)

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-4 py-2">
        <p className="font-medium">{f.nome}</p>
        <p className="text-xs text-slate-400">{PAPEL_LABEL[f.papel] ?? f.papel} · {f.lojaNome}</p>
      </td>
      <td className="px-4 py-2">
        <Input value={salario} onChange={e => setSalario(e.target.value)} className="h-8 text-xs w-28" placeholder="0,00" />
      </td>
      <td className="px-4 py-2">
        {temComissao ? (
          <Input value={comissao} onChange={e => setComissao(e.target.value)} className="h-8 text-xs w-20" placeholder="0,00" />
        ) : (
          <span className="text-xs text-slate-300">—</span>
        )}
      </td>
      <td className="px-4 py-2">
        <Input value={ajudaCusto} onChange={e => setAjudaCusto(e.target.value)} className="h-8 text-xs w-28" placeholder="Opcional" />
      </td>
      <td className="px-4 py-2 text-center">
        <input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} className="rounded border-slate-300" />
      </td>
      <td className="px-4 py-2">
        <Button size="sm" className="h-8 text-xs" disabled={pending} onClick={salvar}>
          {pending ? 'Salvando…' : 'Salvar'}
        </Button>
      </td>
    </tr>
  )
}

export function FuncionariosConfigTable({ funcionarios }: { funcionarios: FuncionarioRow[] }) {
  if (funcionarios.length === 0) {
    return <p className="text-sm text-slate-400 text-center py-8">Nenhum funcionário encontrado nas lojas do grupo.</p>
  }
  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b">
          <tr>
            <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Funcionário</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Salário (R$)</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Comissão (%)</th>
            <th className="text-left px-4 py-2 text-xs font-medium text-slate-600">Ajuda de Custo (R$)</th>
            <th className="text-center px-4 py-2 text-xs font-medium text-slate-600">Ativo</th>
            <th className="px-4 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {funcionarios.map(f => <LinhaFuncionario key={f.usuarioId} f={f} />)}
        </tbody>
      </table>
    </div>
  )
}
