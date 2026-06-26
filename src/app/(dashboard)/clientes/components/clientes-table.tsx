'use client'
import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { excluirClienteAction } from '../actions'

type Cliente = {
  id: string
  nome: string
  tipoPessoa: 'fisica' | 'juridica'
  cpfCnpj: string | null
  sexo: 'masculino' | 'feminino' | 'nao_identificado'
  email: string | null
  celular: string | null
  cidade: string | null
  uf: string | null
}

interface Props {
  clientes: Cliente[]
  isAdmin: boolean
}

function formatarCpfCnpj(v: string | null): string {
  if (!v) return '—'
  const digits = v.replace(/\D/g, '')
  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4')
  }
  if (digits.length === 14) {
    return digits.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5')
  }
  return v
}

function labelSexo(s: string): string {
  if (s === 'masculino') return 'Masculino'
  if (s === 'feminino') return 'Feminino'
  return '—'
}

export function ClientesTable({ clientes, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function handleExcluir(e: React.MouseEvent, id: string, nome: string) {
    e.stopPropagation()
    if (!confirm(`Excluir cliente "${nome}"? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      try {
        await excluirClienteAction(id)
        toast.success('Cliente excluído')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao excluir')
      }
    })
  }

  if (clientes.length === 0) {
    return (
      <div className="py-12 text-center text-slate-400 text-sm">
        Nenhum cliente encontrado.
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Nome</TableHead>
            <TableHead>CPF/CNPJ</TableHead>
            <TableHead>Celular</TableHead>
            <TableHead>Cidade/UF</TableHead>
            <TableHead>Sexo</TableHead>
            <TableHead>Tipo</TableHead>
            {isAdmin && <TableHead className="w-12" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientes.map(c => (
            <TableRow
              key={c.id}
              className="cursor-pointer hover:bg-slate-50"
              onClick={() => router.push(`/clientes/${c.id}`)}
            >
              <TableCell className="font-medium">{c.nome}</TableCell>
              <TableCell className="font-mono text-sm">{formatarCpfCnpj(c.cpfCnpj)}</TableCell>
              <TableCell>{c.celular ?? '—'}</TableCell>
              <TableCell>
                {c.cidade && c.uf
                  ? `${c.cidade}/${c.uf}`
                  : c.cidade ?? c.uf ?? '—'}
              </TableCell>
              <TableCell>{labelSexo(c.sexo)}</TableCell>
              <TableCell>
                <Badge variant={c.tipoPessoa === 'juridica' ? 'secondary' : 'outline'}>
                  {c.tipoPessoa === 'juridica' ? 'PJ' : 'PF'}
                </Badge>
              </TableCell>
              {isAdmin && (
                <TableCell onClick={e => e.stopPropagation()}>
                  <Button
                    variant="ghost"
                    size="icon"
                    disabled={isPending}
                    onClick={e => handleExcluir(e, c.id, c.nome)}
                    className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
