'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { AlertTriangle } from 'lucide-react'
import { aprovarVendaAction, recusarVendaAction } from '../../../vendas/actions'
import { fmtBRL } from '@/lib/preco-minimo'

type Props = {
  aprovacaoId: string
  valor: number
  motivo: string
  vendedorNome: string
  dataSolicitacao: string
  tipo: 'valor_minimo' | 'pagamento_sensivel'
  podeAprovar: boolean
}

export function AprovacaoVendaCard({ aprovacaoId, valor, motivo, vendedorNome, dataSolicitacao, tipo, podeAprovar }: Props) {
  const [loading, setLoading] = useState(false)
  const [recusarOpen, setRecusarOpen] = useState(false)
  const [observacao, setObservacao] = useState('')

  async function aprovar() {
    setLoading(true)
    try {
      const r = await aprovarVendaAction(aprovacaoId)
      if (!r.ok) { toast.error(r.erro); return }
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
      const r = await recusarVendaAction(aprovacaoId, observacao || undefined)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success('Venda recusada')
      setRecusarOpen(false)
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao recusar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="border-warning/50 bg-warning/5">
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2 text-warning">
          <AlertTriangle size={16} />
          Venda aguardando aprovação
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between"><span className="text-muted-foreground">Valor</span><span className="font-bold">{fmtBRL(valor)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Vendedor</span><span>{vendedorNome}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Pedido em</span><span>{new Date(dataSolicitacao).toLocaleString('pt-BR')}</span></div>
        <div>
          <p className="text-muted-foreground mb-1">Motivo</p>
          <p className="bg-card border rounded px-2 py-1.5">{motivo}</p>
        </div>

        {podeAprovar ? (
          <div className="flex gap-2 pt-1">
            <Button size="sm" onClick={aprovar} disabled={loading}>Aprovar</Button>
            <Button size="sm" variant="outline" onClick={() => setRecusarOpen(true)} disabled={loading}>Recusar</Button>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">
            {tipo === 'pagamento_sensivel'
              ? 'Financiamento/transferência — aguardando aprovação do responsável.'
              : 'Aguardando aprovação de um administrador ou sócio.'}
          </p>
        )}
      </CardContent>

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
    </Card>
  )
}
