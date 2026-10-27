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
/** `quantidadeEstoque` é o saldo de `lojaEstoque`, a loja que o form de edição ajusta (#195). */
export function CatalogoTable({ pecas, isGestor, lojaEstoque }: {
  pecas: Peca[]
  isGestor: boolean
  lojaEstoque: { id: string; nome: string } | null
}) {
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

  const editar = (p: Peca) => (
    <PecaForm
      pecaInicial={{ id: p.id, nome: p.nome, valor: p.valor, quantidadeEstoque: p.quantidadeEstoque }}
      lojaEstoque={lojaEstoque}
      trigger={
        <button type="button" aria-label={`Editar ${p.nome}`} className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground">
          <Pencil className="size-4" />
        </button>
      }
    />
  )
  const status = (p: Peca) => isGestor
    ? <PecaAtivoToggle id={p.id} ativo={p.ativo} />
    : <span className="text-xs text-muted-foreground">{p.ativo ? 'Ativo' : 'Inativo'}</span>
  const estoqueCls = (p: Peca) => (p.quantidadeEstoque <= 0 ? 'font-medium text-destructive' : '')

  const vazio = !temCriterio
    ? (
      <span className="flex flex-col items-center gap-2">
        <PackageSearch className="size-6 text-muted-foreground" />
        Digite acima para buscar no catálogo.
      </span>
    )
    : encontradas.length === 0
      ? (soComEstoque && !busca.trim() ? 'Nenhuma peça com estoque no momento.' : 'Nenhuma peça encontrada.')
      : null

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 basis-full sm:basis-auto">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder={`Buscar entre ${pecas.length.toLocaleString('pt-BR')} peças…`}
            className="h-10 w-full rounded-md border border-input bg-background pr-3 pl-9 text-base focus:ring-2 focus:ring-ring focus:outline-none lg:h-9 lg:text-sm"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground select-none">
          <input
            type="checkbox"
            checked={soComEstoque}
            onChange={e => setSoComEstoque(e.target.checked)}
            className="size-4 rounded border-input accent-primary"
          />
          Só as com estoque
        </label>
        {temCriterio && (
          <span className="text-sm text-muted-foreground">
            {encontradas.length === 0
              ? 'nenhuma peça'
              : encontradas.length > LIMITE
                ? `mostrando ${LIMITE} de ${encontradas.length.toLocaleString('pt-BR')} — refine a busca`
                : `${encontradas.length.toLocaleString('pt-BR')} peça(s)`}
          </span>
        )}
      </div>

      {/* Celular/tablet: uma peça por linha, nome em cima e números embaixo. */}
      <div className="overflow-hidden rounded-lg border border-border bg-card lg:hidden">
        {vazio && <p className="py-10 text-center text-sm text-muted-foreground">{vazio}</p>}
        <ul className="divide-y divide-border">
          {visiveis.map(p => (
            <li key={p.id} className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium break-words">{p.nome}</p>
                <p className="text-sm text-muted-foreground">
                  {fmtBRL(p.valor)} · estoque <span className={estoqueCls(p)}>{p.quantidadeEstoque}</span>
                </p>
              </div>
              {status(p)}
              {isGestor && editar(p)}
            </li>
          ))}
        </ul>
      </div>

      <div className="hidden rounded-lg border border-border bg-card lg:block">
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
                <TableCell className={estoqueCls(p)}>{p.quantidadeEstoque}</TableCell>
                <TableCell>{status(p)}</TableCell>
                {isGestor && <TableCell>{editar(p)}</TableCell>}
              </TableRow>
            ))}
            {vazio && (
              <TableRow>
                <TableCell colSpan={colunas} className="py-10 text-center text-muted-foreground">{vazio}</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
