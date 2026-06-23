'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Link2, Link2Off, Loader2, CheckCircle2 } from 'lucide-react'
import { buscarVendasParaVincular, vincularVendaAction, desvincularVendaAction } from '../actions'

type Venda = Awaited<ReturnType<typeof buscarVendasParaVincular>>[number]

type Props = {
  conciliacaoId: string
  dataRef: string
  valorRef: number
  vendaVinculada?: { id: string; numero: number; clienteNome: string; valor: string } | null
}

export function VincularVendaButton({ conciliacaoId, dataRef, valorRef, vendaVinculada }: Props) {
  const [open, setOpen] = useState(false)
  const [vendas, setVendas] = useState<Venda[]>([])
  const [carregando, setCarregando] = useState(false)
  const [pending, startTransition] = useTransition()

  async function abrirModal() {
    setOpen(true)
    setCarregando(true)
    try {
      const lista = await buscarVendasParaVincular(dataRef, valorRef)
      setVendas(lista)
    } finally {
      setCarregando(false)
    }
  }

  function vincular(vendaId: string) {
    startTransition(async () => {
      try {
        await vincularVendaAction(conciliacaoId, vendaId)
        toast.success('Venda vinculada')
        setOpen(false)
      } catch {
        toast.error('Erro ao vincular')
      }
    })
  }

  function desvincular() {
    startTransition(async () => {
      try {
        await desvincularVendaAction(conciliacaoId)
        toast.success('Vínculo removido')
      } catch {
        toast.error('Erro ao desvincular')
      }
    })
  }

  if (vendaVinculada) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="flex items-center gap-1 text-xs text-emerald-700 font-medium">
          <CheckCircle2 size={12} />
          #{vendaVinculada.numero} — {vendaVinculada.clienteNome.split(' ')[0]}
        </span>
        <button
          onClick={desvincular}
          disabled={pending}
          title="Desvincular"
          className="text-slate-400 hover:text-red-500 transition-colors"
        >
          {pending ? <Loader2 size={12} className="animate-spin" /> : <Link2Off size={12} />}
        </button>
      </div>
    )
  }

  return (
    <>
      <Button variant="ghost" size="sm" className="h-7 text-xs px-2 text-slate-500" onClick={abrirModal}>
        <Link2 size={12} className="mr-1" /> Vincular
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>Vincular a uma venda</DialogTitle>
            <p className="text-sm text-slate-500">
              Selecione a venda que corresponde a este recebimento de{' '}
              <span className="font-semibold">{valorRef.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
              {' '}em {new Date(dataRef + 'T12:00:00').toLocaleDateString('pt-BR')}
            </p>
          </DialogHeader>

          {carregando && (
            <div className="flex items-center justify-center py-8">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          )}

          {!carregando && vendas.length === 0 && (
            <p className="text-sm text-slate-500 text-center py-6">
              Nenhuma venda com cartão encontrada ± 5 dias com valor similar.
            </p>
          )}

          {!carregando && vendas.length > 0 && (
            <div className="space-y-1.5 max-h-80 overflow-y-auto">
              {vendas.map(v => (
                <button
                  key={v.id}
                  onClick={() => vincular(v.id)}
                  disabled={pending}
                  className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-200 hover:border-blue-400 hover:bg-blue-50 transition-colors text-sm"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-slate-800">Venda #{v.numero} — {v.clienteNome}</span>
                    <span className="font-semibold text-slate-900">
                      {parseFloat(v.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {new Date(v.dataVenda).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    {' · '}{v.formaPagamento}
                  </div>
                </button>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
