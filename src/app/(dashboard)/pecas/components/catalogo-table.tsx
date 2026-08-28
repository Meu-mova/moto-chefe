'use client'
import { useMemo, useState } from 'react'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Search, Pencil, PackageSearch } from 'lucide-react'
import { filtrarPecas } from '@/lib/busca-peca'
import { PecaAtivoToggle } from './peca-ativo-toggle'
import { PecaForm } from './peca-form'

type Peca = {
  id: string
  nome: string
  valor: string
  quantidadeEstoque: number
  ativo: boolean
}

const LIMITE = 100

function fmtBRL(v: string) {
  return parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/**
 * Catálogo com busca.
 *
 * São ~1.700 peças: despejar todas de uma vez deixava a aba pesada e achar uma
 * viseira ali era rolar a tela no olho. Com a busca vazia a tabela fica vazia de
 * propósito — renderizar 1.700 linhas que ninguém vai ler é justamente o que
 * pesava. O filtro "só com estoque" é a exceção: ele já devolve uma lista curta,
 * então lista sozinho, sem exigir que se digite algo antes.
 *
 * Mesmo filtro da busca da Nova Venda (filtrarPecas): termo solto, sem acento,
 * prefixo primeiro.
 */
export function CatalogoTable({ pecas, isGestor }: { pecas: Peca[]; isGestor: boolean }) {
  const [busca, setBusca] = useState('')
  const [soComEstoque, setSoComEstoque] = useState(false)

  const base = useMemo(
    () => (soComEstoque ? pecas.filter(p => p.quantidadeEstoque > 0) : pecas),
    [pecas, soComEstoque],
  )

  const temCriterio = busca.trim().length > 0 || soComEstoque
  const encontradas = useMemo(
    () => (temCriterio ? filtrarPecas(base, busca, Number.MAX_SAFE_INTEGER) : []),
    [base, busca, temCriterio],
  )
  const visiveis = encontradas.slice(0, LIMITE)
  const colunas = isGestor ? 5 : 4

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder={`Buscar entre ${pecas.length.toLocaleString('pt-BR')} peças…`}
            className="w-full h-9 rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
          />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={soComEstoque}
            onChange={e => setSoComEstoque(e.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          Só as com estoque
        </label>
        {temCriterio && (
          <span className="text-sm text-slate-500">
            {encontradas.length === 0
              ? 'nenhuma peça'
              : encontradas.length > LIMITE
                ? `mostrando ${LIMITE} de ${encontradas.length.toLocaleString('pt-BR')} — refine a busca`
                : `${encontradas.length.toLocaleString('pt-BR')} peça(s)`}
          </span>
        )}
      </div>

      <div className="bg-white rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nome</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Estoque</TableHead>
              <TableHead>Status</TableHead>
              {isGestor && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {visiveis.map(p => (
              <TableRow key={p.id}>
                <TableCell className="font-medium">{p.nome}</TableCell>
                <TableCell>{fmtBRL(p.valor)}</TableCell>
                <TableCell className={p.quantidadeEstoque <= 0 ? 'text-red-600 font-medium' : ''}>
                  {p.quantidadeEstoque}
                </TableCell>
                <TableCell>
                  {isGestor ? (
                    <PecaAtivoToggle id={p.id} ativo={p.ativo} />
                  ) : (
                    <span className="text-xs text-slate-500">{p.ativo ? 'Ativo' : 'Inativo'}</span>
                  )}
                </TableCell>
                {isGestor && (
                  <TableCell>
                    <PecaForm
                      pecaInicial={{ id: p.id, nome: p.nome, valor: p.valor, quantidadeEstoque: p.quantidadeEstoque }}
                      trigger={
                        <button className="text-slate-400 hover:text-slate-700">
                          <Pencil size={14} />
                        </button>
                      }
                    />
                  </TableCell>
                )}
              </TableRow>
            ))}

            {!temCriterio && (
              <TableRow>
                <TableCell colSpan={colunas} className="text-center text-slate-400 py-10">
                  <PackageSearch size={22} className="mx-auto mb-2 text-slate-300" />
                  Digite acima para buscar no catálogo.
                </TableCell>
              </TableRow>
            )}

            {temCriterio && encontradas.length === 0 && (
              <TableRow>
                <TableCell colSpan={colunas} className="text-center text-slate-400 py-8">
                  {soComEstoque && !busca.trim()
                    ? 'Nenhuma peça com estoque no momento.'
                    : 'Nenhuma peça encontrada.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
