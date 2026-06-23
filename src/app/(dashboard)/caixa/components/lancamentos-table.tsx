'use client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Trash2, Paperclip, ExternalLink, Loader2, ShieldCheck, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { excluirLancamentoAction, getComprovanteUrlAction, aprovarLancamentoAction } from '../actions'
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
  aprovado: boolean
  aprovadoPorNome: string | null
  aprovadoEm: Date | null
  criadoEm: Date
}

type Props = {
  lancamentos: Lancamento[]
  isAdmin: boolean
  podeAprovar: boolean
}

type Preview = { signedUrl: string; isPdf: boolean; path: string; lancamentoId: string; aprovado: boolean; aprovadoPorNome: string | null; aprovadoEm: Date | null }

function formatCurrency(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function isPdfPath(path: string) {
  return path.toLowerCase().endsWith('.pdf')
}

function fmtDateTime(d: Date | null) {
  if (!d) return ''
  return new Date(d).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

export function LancamentosTable({ lancamentos, isAdmin, podeAprovar }: Props) {
  const router = useRouter()
  const [excluindo,    setExcluindo]    = useState<string | null>(null)
  const [abrindo,      setAbrindo]      = useState<string | null>(null)
  const [aprovando,    setAprovando]    = useState<string | null>(null)
  const [preview,      setPreview]      = useState<Preview | null>(null)

  async function handleVerComprovante(l: Lancamento) {
    setAbrindo(l.comprovanteUrl!)
    try {
      const url = await getComprovanteUrlAction(l.comprovanteUrl!)
      setPreview({
        signedUrl: url,
        isPdf: isPdfPath(l.comprovanteUrl!),
        path: l.comprovanteUrl!,
        lancamentoId: l.id,
        aprovado: l.aprovado,
        aprovadoPorNome: l.aprovadoPorNome,
        aprovadoEm: l.aprovadoEm,
      })
    } catch {
      toast.error('Erro ao carregar comprovante')
    } finally {
      setAbrindo(null)
    }
  }

  async function handleAprovar(lancamentoId: string) {
    setAprovando(lancamentoId)
    try {
      await aprovarLancamentoAction(lancamentoId)
      toast.success('Comprovante aprovado')
      // Atualiza preview se estiver aberto
      if (preview?.lancamentoId === lancamentoId) {
        setPreview(p => p ? { ...p, aprovado: true } : null)
      }
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao aprovar')
    } finally {
      setAprovando(null)
    }
  }

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
    <>
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
            <TableHead className="text-center">Aprovação</TableHead>
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

              {/* Comprovante */}
              <TableCell className="text-center">
                {l.comprovanteUrl ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-700 disabled:opacity-40"
                    title="Ver comprovante"
                    disabled={abrindo === l.comprovanteUrl}
                    onClick={() => handleVerComprovante(l)}
                  >
                    {abrindo === l.comprovanteUrl
                      ? <Loader2 size={14} className="animate-spin" />
                      : <Paperclip size={14} />
                    }
                  </button>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </TableCell>

              {/* Aprovação */}
              <TableCell className="text-center">
                {l.tipo === 'saida' ? (
                  l.aprovado ? (
                    <span
                      className="inline-flex items-center gap-1 text-green-600 text-xs"
                      title={`Aprovado por ${l.aprovadoPorNome} em ${fmtDateTime(l.aprovadoEm)}`}
                    >
                      <ShieldCheck size={15} />
                      <span className="hidden sm:inline">Aprovado</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1">
                      <ShieldAlert size={15} className="text-amber-500" />
                      {podeAprovar && l.comprovanteUrl && (
                        <button
                          type="button"
                          className="text-xs text-amber-600 hover:text-amber-800 underline disabled:opacity-40"
                          disabled={aprovando === l.id}
                          onClick={() => handleAprovar(l.id)}
                          title="Aprovar comprovante"
                        >
                          {aprovando === l.id ? <Loader2 size={11} className="animate-spin inline" /> : 'Aprovar'}
                        </button>
                      )}
                    </span>
                  )
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

      {/* Modal de preview do comprovante */}
      <Dialog open={!!preview} onOpenChange={open => { if (!open) setPreview(null) }}>
        <DialogContent className="max-w-3xl w-full">
          <DialogHeader>
            <div className="flex items-center justify-between pr-8">
              <DialogTitle>Comprovante</DialogTitle>
              {preview && (
                <a
                  href={preview.signedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-blue-500 hover:text-blue-700"
                >
                  <ExternalLink size={13} />
                  Abrir em nova aba
                </a>
              )}
            </div>
          </DialogHeader>

          {preview && (
            <div className="space-y-3">
              {/* Status de aprovação no modal */}
              {preview.aprovado ? (
                <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
                  <ShieldCheck size={16} />
                  <span>
                    Aprovado por <strong>{preview.aprovadoPorNome}</strong>
                    {preview.aprovadoEm && <> em {fmtDateTime(preview.aprovadoEm)}</>}
                  </span>
                </div>
              ) : podeAprovar ? (
                <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <span className="flex items-center gap-1.5 text-sm text-amber-700">
                    <ShieldAlert size={16} />
                    Pendente de aprovação
                  </span>
                  <Button
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
                    disabled={aprovando === preview.lancamentoId}
                    onClick={() => handleAprovar(preview.lancamentoId)}
                  >
                    {aprovando === preview.lancamentoId
                      ? <><Loader2 size={12} className="animate-spin mr-1" />Aprovando...</>
                      : <><ShieldCheck size={13} className="mr-1" />Aprovar Comprovante</>
                    }
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  <ShieldAlert size={16} />
                  Pendente de aprovação
                </div>
              )}

              {/* Arquivo */}
              {preview.isPdf ? (
                <iframe
                  src={preview.signedUrl}
                  className="w-full rounded border"
                  style={{ height: '65vh' }}
                  title="Comprovante PDF"
                />
              ) : (
                <div className="flex justify-center bg-slate-50 rounded border p-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={preview.signedUrl}
                    alt="Comprovante"
                    className="max-h-[65vh] max-w-full object-contain rounded"
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
