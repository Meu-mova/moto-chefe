'use client'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Trash2, Paperclip, ExternalLink, Loader2, ShieldCheck, ShieldAlert, ShieldX } from 'lucide-react'
import { toast } from 'sonner'
import { excluirLancamentoAction, getComprovanteUrlAction, aprovarLancamentoAction, reprovarLancamentoAction } from '../actions'
import { useRouter } from 'next/navigation'
import { useState, useMemo } from 'react'

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
  statusAprovacao: string
  aprovadoPorNome: string | null
  aprovadoEm: Date | null
  criadoEm: Date
}

type Props = {
  lancamentos: Lancamento[]
  isAdmin: boolean
  podeAprovar: boolean
}

type Preview = {
  signedUrl: string
  isPdf: boolean
  path: string
  lancamentoId: string
  statusAprovacao: string
  aprovadoPorNome: string | null
  aprovadoEm: Date | null
}

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

type Filtros = {
  tipo: string
  categoria: string
  descricao: string
  loja: string
  aprovacao: string
  registradoPor: string
}

export function LancamentosTable({ lancamentos, isAdmin, podeAprovar }: Props) {
  const router = useRouter()
  const [excluindo, setExcluindo] = useState<string | null>(null)
  const [abrindo,   setAbrindo]   = useState<string | null>(null)
  const [agindo,    setAgindo]    = useState<string | null>(null)
  const [preview,   setPreview]   = useState<Preview | null>(null)
  const [filtros, setFiltros] = useState<Filtros>({
    tipo: '', categoria: '', descricao: '', loja: '', aprovacao: '', registradoPor: '',
  })

  function setFiltro(campo: keyof Filtros, valor: string) {
    setFiltros(f => ({ ...f, [campo]: valor === 'todos' ? '' : valor }))
  }

  const categorias = useMemo(() =>
    [...new Set(lancamentos.map(l => l.categoria))].sort(),
    [lancamentos]
  )
  const lojas = useMemo(() =>
    [...new Set(lancamentos.map(l => l.lojaNome))].sort(),
    [lancamentos]
  )

  const dados = useMemo(() => lancamentos.filter(l => {
    if (filtros.tipo && l.tipo !== filtros.tipo) return false
    if (filtros.categoria && l.categoria !== filtros.categoria) return false
    if (filtros.descricao && !l.descricao?.toLowerCase().includes(filtros.descricao.toLowerCase())) return false
    if (filtros.loja && l.lojaNome !== filtros.loja) return false
    if (filtros.aprovacao && l.statusAprovacao !== filtros.aprovacao) return false
    if (filtros.registradoPor && !l.usuarioNome.toLowerCase().includes(filtros.registradoPor.toLowerCase())) return false
    return true
  }), [lancamentos, filtros])

  async function handleVerComprovante(l: Lancamento) {
    setAbrindo(l.comprovanteUrl!)
    try {
      const url = await getComprovanteUrlAction(l.comprovanteUrl!)
      setPreview({
        signedUrl: url,
        isPdf: isPdfPath(l.comprovanteUrl!),
        path: l.comprovanteUrl!,
        lancamentoId: l.id,
        statusAprovacao: l.statusAprovacao,
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
    setAgindo(lancamentoId)
    try {
      await aprovarLancamentoAction(lancamentoId)
      toast.success('Comprovante aprovado')
      if (preview?.lancamentoId === lancamentoId) {
        setPreview(p => p ? { ...p, statusAprovacao: 'aprovado' } : null)
      }
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao aprovar')
    } finally {
      setAgindo(null)
    }
  }

  async function handleReprovar(lancamentoId: string) {
    setAgindo(lancamentoId)
    try {
      await reprovarLancamentoAction(lancamentoId)
      toast.success('Comprovante reprovado')
      if (preview?.lancamentoId === lancamentoId) {
        setPreview(p => p ? { ...p, statusAprovacao: 'reprovado' } : null)
      }
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao reprovar')
    } finally {
      setAgindo(null)
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
          <TableRow className="bg-slate-50 hover:bg-slate-50">
            <TableHead className="py-1" />
            <TableHead className="py-1">
              <Select value={filtros.tipo || 'todos'} onValueChange={v => setFiltro('tipo', v)}>
                <SelectTrigger className="h-7 text-xs w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="entrada">Entrada</SelectItem>
                  <SelectItem value="saida">Saída</SelectItem>
                </SelectContent>
              </Select>
            </TableHead>
            <TableHead className="py-1">
              <Select value={filtros.categoria || 'todos'} onValueChange={v => setFiltro('categoria', v)}>
                <SelectTrigger className="h-7 text-xs w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </TableHead>
            <TableHead className="py-1">
              <Input
                className="h-7 text-xs"
                placeholder="Filtrar..."
                value={filtros.descricao}
                onChange={e => setFiltro('descricao', e.target.value)}
              />
            </TableHead>
            <TableHead className="py-1">
              <Select value={filtros.loja || 'todos'} onValueChange={v => setFiltro('loja', v)}>
                <SelectTrigger className="h-7 text-xs w-full">
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todas</SelectItem>
                  {lojas.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
            </TableHead>
            <TableHead className="py-1" />
            <TableHead className="py-1" />
            <TableHead className="py-1">
              <Select value={filtros.aprovacao || 'todos'} onValueChange={v => setFiltro('aprovacao', v)}>
                <SelectTrigger className="h-7 text-xs w-full">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  <SelectItem value="pendente">Pendente</SelectItem>
                  <SelectItem value="aprovado">Aprovado</SelectItem>
                  <SelectItem value="reprovado">Reprovado</SelectItem>
                </SelectContent>
              </Select>
            </TableHead>
            <TableHead className="py-1">
              <Input
                className="h-7 text-xs"
                placeholder="Filtrar..."
                value={filtros.registradoPor}
                onChange={e => setFiltro('registradoPor', e.target.value)}
              />
            </TableHead>
            {isAdmin && <TableHead className="py-1" />}
          </TableRow>
        </TableHeader>
        <TableBody>
          {dados.length === 0 && (
            <TableRow>
              <TableCell colSpan={isAdmin ? 10 : 9} className="py-8 text-center text-sm text-slate-400">
                Nenhum lançamento encontrado para os filtros aplicados.
              </TableCell>
            </TableRow>
          )}
          {dados.map(l => (
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
                  <AprovacaoCell
                    lancamento={l}
                    podeAprovar={podeAprovar}
                    agindo={agindo}
                    onAprovar={handleAprovar}
                    onReprovar={handleReprovar}
                  />
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
              {/* Barra de status no modal */}
              <StatusBar
                status={preview.statusAprovacao}
                aprovadoPorNome={preview.aprovadoPorNome}
                aprovadoEm={preview.aprovadoEm}
                podeAprovar={podeAprovar}
                agindo={agindo === preview.lancamentoId}
                onAprovar={() => handleAprovar(preview.lancamentoId)}
                onReprovar={() => handleReprovar(preview.lancamentoId)}
              />

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

function AprovacaoCell({ lancamento, podeAprovar, agindo, onAprovar, onReprovar }: {
  lancamento: Lancamento
  podeAprovar: boolean
  agindo: string | null
  onAprovar: (id: string) => void
  onReprovar: (id: string) => void
}) {
  const busy = agindo === lancamento.id

  if (lancamento.statusAprovacao === 'aprovado') {
    return (
      <span
        className="inline-flex items-center gap-1 text-green-600 text-xs"
        title={lancamento.aprovadoPorNome ? `Aprovado por ${lancamento.aprovadoPorNome} em ${fmtDateTime(lancamento.aprovadoEm)}` : undefined}
      >
        <ShieldCheck size={15} />
        <span className="hidden sm:inline">Aprovado</span>
      </span>
    )
  }

  if (lancamento.statusAprovacao === 'reprovado') {
    return (
      <span className="inline-flex items-center gap-1">
        <span
          className="inline-flex items-center gap-1 text-red-600 text-xs"
          title={lancamento.aprovadoPorNome ? `Reprovado por ${lancamento.aprovadoPorNome} em ${fmtDateTime(lancamento.aprovadoEm)}` : undefined}
        >
          <ShieldX size={15} />
          <span className="hidden sm:inline">Reprovado</span>
        </span>
        {podeAprovar && (
          <button
            type="button"
            className="ml-1 text-xs text-slate-400 hover:text-green-700 underline disabled:opacity-40"
            disabled={busy}
            onClick={() => onAprovar(lancamento.id)}
          >
            Aprovar
          </button>
        )}
      </span>
    )
  }

  // pendente
  return (
    <span className="inline-flex items-center gap-1">
      <ShieldAlert size={15} className="text-amber-500 shrink-0" />
      {podeAprovar && lancamento.comprovanteUrl && (
        <>
          <button
            type="button"
            className="text-xs text-green-600 hover:text-green-800 underline disabled:opacity-40"
            disabled={busy}
            onClick={() => onAprovar(lancamento.id)}
          >
            {busy ? <Loader2 size={11} className="animate-spin inline" /> : 'Aprovar'}
          </button>
          <span className="text-slate-300">·</span>
          <button
            type="button"
            className="text-xs text-red-500 hover:text-red-700 underline disabled:opacity-40"
            disabled={busy}
            onClick={() => onReprovar(lancamento.id)}
          >
            Reprovar
          </button>
        </>
      )}
    </span>
  )
}

function StatusBar({ status, aprovadoPorNome, aprovadoEm, podeAprovar, agindo, onAprovar, onReprovar }: {
  status: string
  aprovadoPorNome: string | null
  aprovadoEm: Date | null
  podeAprovar: boolean
  agindo: boolean
  onAprovar: () => void
  onReprovar: () => void
}) {
  if (status === 'aprovado') {
    return (
      <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 border border-green-200 rounded-md px-3 py-2">
        <ShieldCheck size={16} />
        <span>
          Aprovado{aprovadoPorNome && <> por <strong>{aprovadoPorNome}</strong></>}
          {aprovadoEm && <> em {fmtDateTime(aprovadoEm)}</>}
        </span>
        {podeAprovar && (
          <button
            type="button"
            className="ml-auto text-xs text-red-500 hover:text-red-700 underline disabled:opacity-40"
            disabled={agindo}
            onClick={onReprovar}
          >
            Reprovar
          </button>
        )}
      </div>
    )
  }

  if (status === 'reprovado') {
    return (
      <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
        <ShieldX size={16} />
        <span>
          Reprovado{aprovadoPorNome && <> por <strong>{aprovadoPorNome}</strong></>}
          {aprovadoEm && <> em {fmtDateTime(aprovadoEm)}</>}
        </span>
        {podeAprovar && (
          <Button
            size="sm"
            className="ml-auto bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
            disabled={agindo}
            onClick={onAprovar}
          >
            {agindo ? <Loader2 size={12} className="animate-spin mr-1" /> : <ShieldCheck size={13} className="mr-1" />}
            Aprovar
          </Button>
        )}
      </div>
    )
  }

  // pendente
  return (
    <div className="flex items-center justify-between gap-2 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
      <span className="flex items-center gap-1.5 text-sm text-amber-700">
        <ShieldAlert size={16} />
        Pendente de aprovação
      </span>
      {podeAprovar && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant="outline"
            className="border-red-300 text-red-600 hover:bg-red-50 h-7 text-xs"
            disabled={agindo}
            onClick={onReprovar}
          >
            {agindo ? <Loader2 size={12} className="animate-spin mr-1" /> : <ShieldX size={13} className="mr-1" />}
            Reprovar
          </Button>
          <Button
            size="sm"
            className="bg-green-600 hover:bg-green-700 text-white h-7 text-xs"
            disabled={agindo}
            onClick={onAprovar}
          >
            {agindo ? <Loader2 size={12} className="animate-spin mr-1" /> : <ShieldCheck size={13} className="mr-1" />}
            Aprovar
          </Button>
        </div>
      )}
    </div>
  )
}
