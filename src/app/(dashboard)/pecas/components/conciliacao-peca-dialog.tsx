'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Wallet } from 'lucide-react'
import { precisaConciliar, type PgtoOS, type StatusConc } from '@/lib/conciliacao-status'
import { PagamentosConciliacao, useConciliacaoAlvo } from '@/components/pagamentos-conciliacao'

type Props = { vendaId: string; numero: number; pagamentos: unknown; papel: string; status: StatusConc }

// A tabela de peças não tem tela de detalhe — este dialog é o único lugar onde dá pra
// mexer na conciliação de uma venda de peça. Ver src/components/pagamentos-conciliacao.tsx.
export function ConciliacaoPecaDialog({ vendaId, numero, pagamentos, papel, status }: Props) {
  const [open, setOpen] = useState(false)

  const pgtos = ((pagamentos ?? []) as PgtoOS[])
  const dados = useConciliacaoAlvo({ tipo: 'peca', id: vendaId }, open)

  if (!pgtos.some(p => precisaConciliar(p.tipo))) return null

  // O que falta conciliar precisa chamar atenção: um ícone cinza de 13px passava
  // despercebido e a tela parecia não ter conciliação nenhuma.
  const resolvido = status === 'conciliada'

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Ver conciliação dos pagamentos"
        className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
          resolvido
            ? 'text-slate-400 hover:text-blue-600 hover:bg-blue-50'
            : 'text-blue-700 bg-blue-50 border border-blue-200 hover:bg-blue-100'
        }`}
      >
        <Wallet size={13} />
        {!resolvido && 'Conciliar'}
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
