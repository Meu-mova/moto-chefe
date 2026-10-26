'use client'
import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertTriangle, Landmark, TrendingDown } from 'lucide-react'
import { aprovarVendaAction, recusarVendaAction } from '../actions'
import type { AprovacaoPendente } from '@/lib/queries/motos'

const fmt = (v: string | number) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

type Props = {
  aprovacoes: AprovacaoPendente[]
  podeAprovarValorMinimo: boolean
  podeAprovarSensivel: boolean
}

function Linha({ aprovacao, podeAprovar }: { aprovacao: AprovacaoPendente; podeAprovar: boolean }) {
  const [loading, setLoading] = useState(false)
  const [recusarOpen, setRecusarOpen] = useState(false)
  const [observacao, setObservacao] = useState('')

  const sensivel = aprovacao.tipo === 'pagamento_sensivel'

  async function aprovar() {
    setLoading(true)
    try {
      await aprovarVendaAction(aprovacao.id)
      toast.success('Venda aprovada!')
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao aprovar')
    } finally {
      setLoading(false)
    }
  }

  async function recusar() {
    setLoading(true)
    try {
      await recusarVendaAction(aprovacao.id, observacao || undefined)
      toast.success('Venda recusada')
      setRecusarOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao recusar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className={`flex items-center justify-between gap-3 rounded-lg border px-4 py-3 ${
      sensivel ? 'bg-info/10 border-info/30' : 'bg-warning/10 border-warning/30'
    }`}>
      <div className="flex items-start gap-2.5 min-w-0">
        {sensivel
          ? <Landmark size={16} className="text-info mt-0.5 shrink-0" />
          : <TrendingDown size={16} className="text-warning mt-0.5 shrink-0" />}
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {aprovacao.origem === 'os' ? (
              <Link href={`/ordens-servico/${aprovacao.osId}`} className="font-medium text-foreground hover:underline">
                OS #{aprovacao.osNumero ?? '—'} — {aprovacao.osClienteNome ?? 'Cliente não identificado'}
              </Link>
            ) : aprovacao.origem === 'peca_edicao' ? (
              <span className="font-medium text-foreground">
                Edição da venda de peças #{(aprovacao.dadosVenda as { numero?: number })?.numero ?? '—'} — {(aprovacao.dadosVenda as { clienteNome?: string | null })?.clienteNome || 'Cliente não identificado'}
              </span>
            ) : aprovacao.origem === 'peca' ? (
              <span className="font-medium text-foreground">
                Venda de peças — {(aprovacao.dadosVenda as { clienteNome?: string })?.clienteNome || 'Cliente não identificado'}
              </span>
            ) : (
              <Link href={`/estoque/${aprovacao.motoId}`} className="font-medium text-foreground hover:underline">
                {aprovacao.marca} {aprovacao.modelo} — {aprovacao.cor}
              </Link>
            )}
            <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${
              sensivel ? 'bg-info/10 text-info' : 'bg-warning/10 text-warning'
            }`}>
              {sensivel ? 'Financiamento/Transferência' : 'Abaixo do mínimo'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {aprovacao.lojaNome} · {aprovacao.vendedorNome} · {new Date(aprovacao.dataSolicitacao).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md" title={aprovacao.motivo}>{aprovacao.motivo}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 shrink-0">
        <span className="font-bold text-foreground tabular-nums">{fmt(aprovacao.valor)}</span>
        {podeAprovar ? (
          <div className="flex gap-1.5">
            <Button size="sm" className="h-8 text-xs" onClick={aprovar} disabled={loading}>Aprovar</Button>
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setRecusarOpen(true)} disabled={loading}>Recusar</Button>
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">
            {sensivel ? 'Aguarda o responsável' : 'Aguarda admin/sócio'}
          </span>
        )}
      </div>

      <Dialog open={recusarOpen} onOpenChange={setRecusarOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Recusar venda</DialogTitle></DialogHeader>
          <Textarea
            placeholder="Observação (opcional)"
            value={observacao}
            onChange={e => setObservacao(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecusarOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={recusar} disabled={loading}>
              {loading ? 'Recusando...' : 'Confirmar recusa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function AprovacoesPendentesPanel({ aprovacoes, podeAprovarValorMinimo, podeAprovarSensivel }: Props) {
  if (aprovacoes.length === 0) return null

  return (
    <section className="space-y-3">
      <h2 className="font-semibold text-sm text-foreground flex items-center gap-1.5">
        <AlertTriangle size={15} className="text-warning" />
        Aprovações Pendentes ({aprovacoes.length})
      </h2>
      <div className="space-y-2">
        {aprovacoes.map(a => (
          <Linha
            key={a.id}
            aprovacao={a}
            podeAprovar={a.tipo === 'pagamento_sensivel' ? podeAprovarSensivel : podeAprovarValorMinimo}
          />
        ))}
      </div>
    </section>
  )
}
