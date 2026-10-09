'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { NfSaidaCard } from '../../estoque/components/nf-saida-card'
import { notasDaVendaAction, type NotaResumo } from '../nfe-propria-actions'

export type NfDaVenda = { vendaId: string; vendaNumero: number; nf: string; descricao: string }

export function NfSaidaVendaDialog({ venda, onFechar }: { venda: NfDaVenda; onFechar: () => void }) {
  const [notas, setNotas] = useState<NotaResumo[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    notasDaVendaAction(venda.vendaId).then(r => {
      if (!ativo) return
      if (r.ok) setNotas(r.notas)
      else setErro(r.error)
    })
    return () => { ativo = false }
  }, [venda.vendaId])

  function atualizarNota(nota: NotaResumo) {
    setNotas(ns => ns && ns.map(n => (n.id === nota.id ? nota : n)))
  }

  const daNf = notas?.filter(n => n.numero === venda.nf) ?? []
  const outras = notas?.filter(n => n.numero !== venda.nf) ?? []

  return (
    <Dialog open onOpenChange={aberto => { if (!aberto) onFechar() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>NF de saída {venda.nf}</DialogTitle>
          <DialogDescription>Venda #{venda.vendaNumero} · {venda.descricao}</DialogDescription>
        </DialogHeader>
        {erro ? (
          <p className="text-sm text-red-600">{erro}</p>
        ) : !notas ? (
          <p className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin text-teal-600" /> Carregando a nota…
          </p>
        ) : (
          <div className="space-y-3">
            {daNf.length ? (
              <div className="space-y-2">
                {daNf.map(n => <NfSaidaCard key={n.id} nota={n} onAtualizada={atualizarNota} />)}
              </div>
            ) : (
              <p className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                Esta NF não foi emitida pelo MOVA: veio do Bling ou foi registrada em &quot;Nota já emitida&quot;. O MOVA
                não acompanha o status dela, e o cancelamento é feito onde ela foi emitida (em geral, no Bling).
              </p>
            )}
            {outras.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Outras notas do MOVA desta venda</p>
                {outras.map(n => <NfSaidaCard key={n.id} nota={n} onAtualizada={atualizarNota} />)}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
