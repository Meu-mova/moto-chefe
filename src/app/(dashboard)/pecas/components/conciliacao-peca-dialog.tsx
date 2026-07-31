'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Wallet } from 'lucide-react'
import { precisaConciliar, type PgtoOS } from '@/lib/conciliacao-status'
import { PagamentosConciliacao, useConciliacaoAlvo } from '@/components/pagamentos-conciliacao'

type Props = { vendaId: string; numero: number; pagamentos: unknown; papel: string }

// A tabela de peças não tem tela de detalhe — este dialog é o único lugar onde dá pra
// mexer na conciliação de uma venda de peça. Ver src/components/pagamentos-conciliacao.tsx.
export function ConciliacaoPecaDialog({ vendaId, numero, pagamentos, papel }: Props) {
  const [open, setOpen] = useState(false)

  const pgtos = ((pagamentos ?? []) as PgtoOS[])
  const dados = useConciliacaoAlvo({ tipo: 'peca', id: vendaId }, open)

  if (!pgtos.some(p => precisaConciliar(p.tipo))) return null

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ver conciliação dos pagamentos"
        className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
      >
        <Wallet size={13} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Conciliação — Venda de peças #{numero}</DialogTitle>
          </DialogHeader>
          <PagamentosConciliacao
            alvo={{ tipo: 'peca', id: vendaId }}
            pagamentos={pgtos}
            dados={dados}
            papel={papel}
            somenteConciliaveis
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
