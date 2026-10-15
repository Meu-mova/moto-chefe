'use client'
import { useState, useTransition } from 'react'
import { ArrowLeft, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { formatarCpfCnpj } from '@/lib/documento'
import { formatarNumeroBR } from '@/lib/numero-br'
import {
  CAMPOS_CONTRATO, ROTULO_STATUS_ADESAO, camposFaltando,
  type CampoContrato, type StatusAdesao,
} from '@/lib/adesao-campos'
import {
  salvarDadosContratoAction, recusarAdesaoAction, linkCartaoCnpjAction, type AdesaoLinha,
} from '../actions'

const CLASSE_STATUS: Record<StatusAdesao, string> = {
  pendente: 'border-warning text-warning',
  dados_completos: 'border-primary text-primary-text',
  recusada: 'border-destructive text-destructive',
}

function StatusBadge({ status }: { status: string }) {
  const s = status as StatusAdesao
  return <Badge variant="outline" className={CLASSE_STATUS[s]}>{ROTULO_STATUS_ADESAO[s] ?? status}</Badge>
}

const data = (d: Date | string) => new Date(d).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })

function resumoContrato(a: AdesaoLinha): string {
  if (a.status === 'recusada') return '—'
  const faltam = camposFaltando(a).length
  return faltam ? `faltam ${faltam}` : 'completo'
}

export function AdesoesPainel({ adesoes }: { adesoes: AdesaoLinha[] }) {
  const [selId, setSelId] = useState<string | null>(null)
  const sel = adesoes.find(a => a.id === selId) ?? null

  return (
    <div className="space-y-4">
      <div className={sel ? 'hidden lg:block' : ''}>
        <h1 className="text-2xl font-bold">Adesões</h1>
        <p className="text-muted-foreground text-sm">Lojistas que pediram para aderir ao MOVA pelo /adesao</p>
      </div>

      <div className={`grid gap-4 ${sel ? 'lg:grid-cols-[1fr_1.2fr]' : ''}`}>
        <div className={sel ? 'hidden lg:block' : ''}>
          {adesoes.length === 0
            ? <p className="text-sm text-muted-foreground">Nenhuma adesão recebida ainda.</p>
            : <Lista adesoes={adesoes} selId={selId} onAbrir={setSelId} />}
        </div>
        {/* key: trocar de adesão remonta o painel e zera o formulário. */}
        {sel && <Detalhe key={sel.id} adesao={sel} onFechar={() => setSelId(null)} />}
      </div>
    </div>
  )
}

function Lista({ adesoes, selId, onAbrir }: { adesoes: AdesaoLinha[]; selId: string | null; onAbrir: (id: string) => void }) {
  return (
    <>
      <div className="space-y-2 md:hidden">
        {adesoes.map(a => (
          <button
            key={a.id}
            type="button"
            onClick={() => onAbrir(a.id)}
            className={`w-full text-left rounded-lg border bg-card p-3 hover:bg-muted ${a.id === selId ? 'bg-muted' : ''}`}
          >
            <div className="flex justify-between gap-2">
              <span className="font-medium text-sm">{a.loja}</span>
              <StatusBadge status={a.status} />
            </div>
            <div className="text-xs text-muted-foreground mt-1">
              {a.responsavel} · {data(a.criadoEm)} · {resumoContrato(a)}
            </div>
          </button>
        ))}
      </div>
      <div className="hidden md:block bg-card rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Loja</TableHead>
              <TableHead>Responsável</TableHead>
              <TableHead>Recebida</TableHead>
              <TableHead>Contrato</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adesoes.map(a => (
              <TableRow
                key={a.id}
                onClick={() => onAbrir(a.id)}
                className={`cursor-pointer ${a.id === selId ? 'bg-muted' : ''}`}
              >
                <TableCell className="font-medium">{a.loja}</TableCell>
                <TableCell>{a.responsavel}</TableCell>
                <TableCell>{data(a.criadoEm)}</TableCell>
                <TableCell className="text-muted-foreground">{resumoContrato(a)}</TableCell>
                <TableCell><StatusBadge status={a.status} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

function valoresIniciais(a: AdesaoLinha): Record<CampoContrato, string> {
  return {
    razaoSocial: a.razaoSocial ?? '',
    cnpj: formatarCpfCnpj(a.cnpj),
    enderecoSede: a.enderecoSede ?? '',
    email: a.email ?? '',
    responsavelCpf: formatarCpfCnpj(a.responsavelCpf),
    valorMensal: a.valorMensal ? formatarNumeroBR(a.valorMensal) : '',
    diaVencimento: a.diaVencimento ? String(a.diaVencimento) : '',
  }
}

function Detalhe({ adesao: a, onFechar }: { adesao: AdesaoLinha; onFechar: () => void }) {
  const [valores, setValores] = useState(() => valoresIniciais(a))
  const [erros, setErros] = useState<Partial<Record<CampoContrato, string>>>({})
  const [recusando, setRecusando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [pendente, iniciar] = useTransition()
  const recusada = a.status === 'recusada'
  const faltam = camposFaltando(valores)

  function salvar() {
    iniciar(async () => {
      const r = await salvarDadosContratoAction(a.id, valores)
      if (!r.ok) {
        setErros(r.erros ?? {})
        toast.error(r.erro ?? 'Corrija os campos marcados')
        return
      }
      setErros({})
      toast.success(r.status === 'dados_completos' ? 'Dados completos para o contrato' : 'Dados salvos')
    })
  }

  function recusar() {
    iniciar(async () => {
      const r = await recusarAdesaoAction(a.id, motivo)
      if (!r.ok) { toast.error(r.erro); return }
      if (r.whatsapp === 'enviado') toast.success('Adesão recusada e lojista avisado por WhatsApp')
      else toast.warning(`Adesão recusada, mas o WhatsApp não saiu. Avise ${a.responsavel} por outro meio: ${a.celular}`)
      setRecusando(false)
    })
  }

  function abrirCartao() {
    iniciar(async () => {
      const r = await linkCartaoCnpjAction(a.id)
      if (r.ok) window.open(r.url, '_blank', 'noopener')
      else toast.error(r.erro)
    })
  }

  return (
    <section className="bg-card rounded-lg border p-4 space-y-4 min-w-0">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={onFechar} className="lg:hidden text-muted-foreground" aria-label="Voltar para a lista">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h2 className="font-semibold">{a.loja}</h2>
          <StatusBadge status={a.status} />
        </div>
        <button type="button" onClick={onFechar} className="hidden lg:block text-muted-foreground" aria-label="Fechar">
          <X className="h-5 w-5" />
        </button>
      </div>

      <details open>
        <summary className="text-sm font-medium cursor-pointer mb-2">O que o lojista enviou</summary>
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm break-words">
          <dt className="text-muted-foreground">Responsável</dt><dd>{a.responsavel}</dd>
          <dt className="text-muted-foreground">Celular</dt><dd>{a.celular}</dd>
          <dt className="text-muted-foreground">Recebida</dt><dd>{data(a.criadoEm)}</dd>
          <dt className="text-muted-foreground">Usuários pedidos</dt><dd>{a.usuarios.length}</dd>
          <dt className="text-muted-foreground">Cartão CNPJ</dt>
          <dd>
            <button type="button" onClick={abrirCartao} disabled={pendente} className="text-primary-text underline">
              abrir arquivo
            </button>
          </dd>
          <dt className="text-muted-foreground">Certificado e senhas</dt>
          <dd className="text-muted-foreground">guardados cifrados (não exibidos)</dd>
        </dl>
      </details>

      <div className="border-t pt-4 space-y-3">
        <h3 className="font-medium">Dados do contrato</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CAMPOS_CONTRATO.map(c => (
            <div key={c.chave} className={c.chave === 'razaoSocial' || c.chave === 'enderecoSede' ? 'sm:col-span-2 space-y-1' : 'space-y-1'}>
              <Label htmlFor={`${a.id}-${c.chave}`}>{c.rotulo}</Label>
              <Input
                id={`${a.id}-${c.chave}`}
                value={valores[c.chave]}
                disabled={recusada || pendente}
                inputMode={c.chave === 'diaVencimento' || c.chave === 'cnpj' || c.chave === 'responsavelCpf' ? 'numeric' : c.chave === 'valorMensal' ? 'decimal' : undefined}
                placeholder={c.chave === 'diaVencimento' ? '1 a 28' : undefined}
                aria-invalid={!!erros[c.chave]}
                onChange={e => {
                  const v = e.target.value
                  setValores(prev => ({ ...prev, [c.chave]: v }))
                }}
              />
              {erros[c.chave] && <p className="text-xs text-destructive">{erros[c.chave]}</p>}
            </div>
          ))}
        </div>
      </div>

      {recusada ? (
        <p className="text-sm text-destructive">
          Recusada em {a.recusadaEm ? data(a.recusadaEm) : '—'}: {a.motivoRecusa}
        </p>
      ) : recusando ? (
        <div className="space-y-2">
          <Label htmlFor={`${a.id}-motivo`}>Motivo da recusa (vai por WhatsApp para {a.celular})</Label>
          <Textarea id={`${a.id}-motivo`} value={motivo} onChange={e => setMotivo(e.target.value)} rows={3} />
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" onClick={recusar} disabled={pendente || motivo.trim().length < 3}>Recusar e avisar</Button>
            <Button variant="outline" onClick={() => setRecusando(false)} disabled={pendente}>Voltar</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button onClick={salvar} disabled={pendente}>Salvar dados</Button>
          <Button variant="outline" className="border-destructive text-destructive" onClick={() => setRecusando(true)} disabled={pendente}>
            Recusar…
          </Button>
          <span className="text-xs text-muted-foreground">
            {faltam.length ? `Faltam ${faltam.length} campo(s) para o contrato` : 'Pronto para o contrato'}
          </span>
        </div>
      )}
    </section>
  )
}
