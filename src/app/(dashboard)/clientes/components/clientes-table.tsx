'use client'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
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
import { Button, buttonVariants } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { Trash2 } from 'lucide-react'
import { excluirClienteAction } from '../actions'
import { HistoricoCliente } from './historico-cliente'

type Cliente = {
  id: string
  nome: string
  tipoPessoa: 'fisica' | 'juridica'
  cpfCnpj: string | null
  sexo: 'masculino' | 'feminino' | 'nao_identificado'
  email: string | null
  celular: string | null
  endereco: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cep: string | null
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

function cidadeUf(c: Cliente) {
  return c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade ?? c.uf ?? '—'
}

function enderecoCompleto(c: Cliente) {
  return [c.endereco, c.numero ? `nº ${c.numero}` : null, c.complemento, c.bairro, c.cidade, c.uf, c.cep]
    .filter(Boolean).join(', ')
}

/** "PF · Feminino" ou "PJ": sexo só faz sentido para pessoa física. */
function TipoTag({ c }: { c: Cliente }) {
  const sexo = labelSexo(c.sexo)
  return (
    <Badge variant="secondary" className="shrink-0">
      {c.tipoPessoa === 'juridica' ? 'PJ' : sexo === '—' ? 'PF' : `PF · ${sexo}`}
    </Badge>
  )
}

function Linha({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-3 border-b border-border py-2 last:border-0">
      <span className="text-muted-foreground">{rotulo}</span>
      <span className="min-w-0 text-right break-words">{children}</span>
    </div>
  )
}

export function ClientesTable({ clientes, isAdmin }: Props) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [aberto, setAberto] = useState<Cliente | null>(null)

  function handleExcluir(e: React.MouseEvent, id: string, nome: string) {
    e.stopPropagation()
    if (!confirm(`Excluir cliente "${nome}"? Esta ação não pode ser desfeita.`)) return
    startTransition(async () => {
      try {
        await excluirClienteAction(id)
        toast.success('Cliente excluído')
        setAberto(null)
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Erro ao excluir')
      }
    })
  }

  if (clientes.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Nenhum cliente encontrado.
      </div>
    )
  }

  return (
    <>
      {/* Celular e tablet: cartões; o toque abre endereço e histórico. */}
      <div className="space-y-3 p-3 lg:hidden">
        {clientes.map(c => (
          <button
            key={c.id}
            type="button"
            onClick={() => setAberto(c)}
            className="block w-full rounded-xl border border-border bg-card p-4 text-left hover:bg-muted"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="min-w-0 font-semibold break-words">{c.nome}</p>
              <TipoTag c={c} />
            </div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">{c.tipoPessoa === 'juridica' ? 'CNPJ' : 'CPF'}</dt>
                <dd className="truncate font-mono text-xs">{formatarCpfCnpj(c.cpfCnpj)}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-muted-foreground">Celular</dt>
                <dd className="truncate">{c.celular ?? '—'}</dd>
              </div>
              <div className="col-span-2 min-w-0">
                <dt className="text-xs text-muted-foreground">Cidade/UF</dt>
                <dd className="truncate">{cidadeUf(c)}</dd>
              </div>
            </dl>
          </button>
        ))}
      </div>

      <Sheet open={!!aberto} onOpenChange={o => !o && setAberto(null)}>
        <SheetContent side="bottom" className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-2xl p-4 pb-8">
          {aberto && (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2 pr-8">
                <SheetTitle className="text-base">{aberto.nome}</SheetTitle>
                <TipoTag c={aberto} />
              </div>
              <div className="text-sm">
                <Linha rotulo={aberto.tipoPessoa === 'juridica' ? 'CNPJ' : 'CPF'}>
                  <span className="font-mono text-xs">{formatarCpfCnpj(aberto.cpfCnpj)}</span>
                </Linha>
                <Linha rotulo="Celular">{aberto.celular ?? '—'}</Linha>
                <Linha rotulo="E-mail">{aberto.email ?? '—'}</Linha>
              </div>
              <section>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Endereço</h3>
                <p className="text-sm">{enderecoCompleto(aberto) || '—'}</p>
              </section>
              <section>
                <h3 className="mb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Histórico</h3>
                <HistoricoCliente clienteId={aberto.id} cpfCnpj={aberto.cpfCnpj} />
              </section>
              <div className="flex gap-2">
                <Link href={`/clientes/${aberto.id}`} className={buttonVariants({ className: 'h-11 flex-1' })}>
                  Abrir cadastro
                </Link>
                {isAdmin && (
                  <Button
                    variant="outline"
                    aria-label="Excluir cliente"
                    disabled={isPending}
                    onClick={e => handleExcluir(e, aberto.id, aberto.nome)}
                    className="h-11 text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Desktop: tabela. */}
      <div className="hidden overflow-x-auto lg:block">
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
                className="cursor-pointer hover:bg-muted"
                onClick={() => router.push(`/clientes/${c.id}`)}
              >
                <TableCell className="font-medium">{c.nome}</TableCell>
                <TableCell className="font-mono text-sm">{formatarCpfCnpj(c.cpfCnpj)}</TableCell>
                <TableCell>{c.celular ?? '—'}</TableCell>
                <TableCell>{cidadeUf(c)}</TableCell>
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
                      aria-label="Excluir cliente"
                      disabled={isPending}
                      onClick={e => handleExcluir(e, c.id, c.nome)}
                      className="h-8 w-8 text-destructive hover:bg-destructive/10"
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
    </>
  )
}
