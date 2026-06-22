'use client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trash2, Paperclip } from 'lucide-react'
import { toast } from 'sonner'
import { excluirLancamentoAction, getComprovanteUrlAction } from '../actions'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

type Lancamento = {
  id: string
  tipo: string
  categoria: string
  descricao: string | null
  valor: string
  data: string
  lojaNome: string
  usuarioNome: string
  comprovanteUrl: string | null
  criadoEm: Date
}

type Props = {
  lancamentos: Lancamento[]
  isAdmin: boolean
}

function formatCurrency(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function LancamentosTable({ lancamentos, isAdmin }: Props) {
  const router = useRouter()
  const [excluindo, setExcluindo] = useState<string | null>(null)

  async function handleExcluir(id: string) {
    if (!confirm('Excluir este lançamento?')) return
    setExcluindo(id)
    try {
      await excluirLancamentoAction(id)
      toast.success('Lançamento excluído')
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
    } finally {
      setExcluindo(null)
    }
  }

  if (lancamentos.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">Nenhum lançamento encontrado.</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Categoria</TableHead>
          <TableHead>Descrição</TableHead>
          <TableHead>Loja</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead className="text-center">Comprov.</TableHead>
          <TableHead>Registrado por</TableHead>
          {isAdmin && <TableHead className="w-10" />}
        </TableRow>
      </TableHeader>
      <TableBody>
        {lancamentos.map(l => (
          <TableRow key={l.id}>
            <TableCell className="whitespace-nowrap">
              {new Date(l.data + 'T12:00:00').toLocaleDateString('pt-BR')}
            </TableCell>
            <TableCell>
              <Badge variant={l.tipo === 'entrada' ? 'default' : 'destructive'}>
                {l.tipo === 'entrada' ? 'Entrada' : 'Saída'}
              </Badge>
            </TableCell>
            <TableCell>{l.categoria}</TableCell>
            <TableCell className="max-w-[200px] truncate text-slate-500">{l.descricao ?? '—'}</TableCell>
            <TableCell>{l.lojaNome}</TableCell>
            <TableCell className={`text-right font-mono ${l.tipo === 'entrada' ? 'text-green-600' : 'text-red-600'}`}>
              {l.tipo === 'entrada' ? '+' : '-'}{formatCurrency(l.valor)}
            </TableCell>
            <TableCell className="text-center">
              {l.comprovanteUrl ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700"
                  title="Ver comprovante"
                  onClick={async () => {
                    try {
                      const url = await getComprovanteUrlAction(l.comprovanteUrl!)
                      window.open(url, '_blank')
                    } catch {
                      toast.error('Erro ao abrir comprovante')
                    }
                  }}
                >
                  <Paperclip size={14} />
                </button>
              ) : (
                <span className="text-slate-300">—</span>
              )}
            </TableCell>
            <TableCell className="text-xs text-slate-400">{l.usuarioNome}</TableCell>
            {isAdmin && (
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-red-400 hover:text-red-600"
                  onClick={() => handleExcluir(l.id)}
                  disabled={excluindo === l.id}
                >
                  <Trash2 size={14} />
                </Button>
              </TableCell>
            )}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
