'use client'
import { useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { excluirDespesaAction } from '../actions'
import { EditarDespesaButton } from './despesa-dialog'
import type { Loja, DespesaRow } from '../types'

type Props = {
  despesas: DespesaRow[]
  lojas: Loja[]
  categorias: string[]
  categoriasComBeneficiario: string[]
  beneficiarios: string[]
}

function fmt(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtData(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')
}

export function DespesasTable({ despesas, lojas, categorias, categoriasComBeneficiario, beneficiarios }: Props) {
  const router = useRouter()
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [filtroCategoria, setFiltroCategoria] = useState('')
  const [filtroLoja, setFiltroLoja]           = useState('')
  const [filtroBusca, setFiltroBusca]         = useState('')

  const categoriasFiltro = useMemo(() =>
    [...new Set(despesas.map(d => d.categoria))].sort(),
    [despesas]
  )

  const dados = useMemo(() => despesas.filter(d => {
    if (filtroCategoria && d.categoria !== filtroCategoria) return false
    if (filtroLoja === '__geral' && d.lojaId !== null) return false
    if (filtroLoja && filtroLoja !== '__geral' && d.lojaId !== filtroLoja) return false
    if (filtroBusca) {
      const q = filtroBusca.toLowerCase()
      if (!d.descricao?.toLowerCase().includes(q) &&
          !d.categoria.toLowerCase().includes(q) &&
          !d.banco.toLowerCase().includes(q)) return false
    }
    return true
  }), [despesas, filtroCategoria, filtroLoja, filtroBusca])

  const total = useMemo(() =>
    dados.reduce((s, d) => s + Number(d.valor), 0),
    [dados]
  )

  async function handleExcluir(id: string) {
    if (!confirm('Excluir esta despesa?')) return
    setExcluindo(id)
    try {
      await excluirDespesaAction(id)
      toast.success('Despesa excluída')
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao excluir')
    } finally {
      setExcluindo(null)
    }
  }

  if (despesas.length === 0) {
    return <p className="text-sm text-slate-400 py-8 text-center">Nenhuma despesa encontrada.</p>
  }

  return (
    <div className="space-y-3">
      {/* Filtros inline */}
      <div className="flex gap-2 flex-wrap">
        <Select value={filtroCategoria || '__todas'} onValueChange={v => setFiltroCategoria(v == null || v === '__todas' ? '' : v)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas">Todas as categorias</SelectItem>
            {categoriasFiltro.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>

        <Select value={filtroLoja || '__todas'} onValueChange={v => setFiltroLoja(v == null || v === '__todas' ? '' : v)}>
          <SelectTrigger className="h-8 w-44 text-xs">
            <SelectValue placeholder="Loja" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__todas">Todas as lojas</SelectItem>
            <SelectItem value="__geral">Geral (empresa)</SelectItem>
            {lojas.map(l => <SelectItem key={l.id} value={l.id}>{l.nome}</SelectItem>)}
          </SelectContent>
        </Select>

        <Input
          className="h-8 text-xs w-48"
          placeholder="Buscar descrição / categoria / banco..."
          value={filtroBusca}
          onChange={e => setFiltroBusca(e.target.value)}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead>Categoria</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Loja</TableHead>
            <TableHead>Pgto</TableHead>
            <TableHead>Banco</TableHead>
            <TableHead className="text-right">Valor</TableHead>
            <TableHead className="w-16" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.length === 0 && (
            <TableRow>
              <TableCell colSpan={8} className="py-8 text-center text-sm text-slate-400">
                Nenhuma despesa para os filtros aplicados.
              </TableCell>
            </TableRow>
          )}
          {dados.map(d => (
            <TableRow key={`${d.origem}-${d.id}`}>
              <TableCell className="whitespace-nowrap text-sm">{fmtData(d.data)}</TableCell>
              <TableCell className="text-sm">
                {d.categoria}
                {d.origem === 'caixa' && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wide bg-amber-100 text-amber-700 rounded px-1 py-0.5">
                    caixa
                  </span>
                )}
                {/* O nome vem embaixo da categoria, e não em coluna nova: só
                    retirada e pró-labore têm, e uma coluna vazia em todo o resto
                    custaria mais espaço do que informa. */}
                {d.beneficiario && (
                  <span className="block text-xs font-medium text-violet-700">{d.beneficiario}</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-slate-500 max-w-[180px] truncate">{d.descricao ?? '—'}</TableCell>
              <TableCell className="text-sm">
                {d.lojaNome ?? <span className="text-slate-400 text-xs italic">Geral</span>}
              </TableCell>
              <TableCell className="text-sm">{d.formaPagamento}</TableCell>
              <TableCell className="text-sm">{d.banco}</TableCell>
              <TableCell className="text-right font-mono text-sm text-red-600">
                -{fmt(d.valor)}
              </TableCell>
              <TableCell>
                {/* Lançamento de caixa se edita no /caixa, onde ele nasceu e onde passa
                    pela aprovação — aqui ele só compõe o resultado. */}
                {d.origem === 'caixa' ? (
                  <span className="text-xs text-slate-400">no /caixa</span>
                ) : (
                  <div className="flex items-center gap-1">
                    <EditarDespesaButton
                      lojas={lojas} despesa={d} categorias={categorias}
                      categoriasComBeneficiario={categoriasComBeneficiario} beneficiarios={beneficiarios}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-red-400 hover:text-red-600"
                      onClick={() => handleExcluir(d.id)}
                      disabled={excluindo === d.id}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                )}
              </TableCell>
            </TableRow>
          ))}
          {dados.length > 0 && (
            <TableRow className="bg-slate-50 font-semibold">
              <TableCell colSpan={6} className="text-sm text-slate-600">Total filtrado</TableCell>
              <TableCell className="text-right font-mono text-sm text-red-700">
                -{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </TableCell>
              <TableCell />
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}
