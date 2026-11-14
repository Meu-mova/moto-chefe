import type { ReactNode } from 'react'
import { brl } from '@/lib/dashboard-painel'
import { enderecoDaEntregaEmLinha, freteDaVenda, textoDaEntrega, type EntregaVenda } from '@/lib/notagateway/entrega'
import { textoDaModalidade } from '@/lib/notagateway/transporte'

type Props = {
  rotulo: string
  entrega: EntregaVenda | null
  /** Sufixo do título ("(do pedido)" na efetivação). */
  sufixo?: string
  /** O que a tela diz quando não há Entrega (pedido ou venda de antes da Entrega). */
  semEntrega: ReactNode
  /** Sem Entrega o cartão fica com o fundo de aviso: a nota segue outra regra (#896). */
  avisoSemEntrega?: boolean
  /** "Alterar" ou a frase da trava, à direita do título. */
  acao?: ReactNode
}

/** A Entrega por inteiro, o mesmo cartão na efetivação e na prévia da NF (#896, variante B). */
export function ResumoDaEntrega({ rotulo, entrega, sufixo, semEntrega, avisoSemEntrega, acao }: Props) {
  const frete = freteDaVenda(entrega)
  const fundo = !entrega && avisoSemEntrega ? 'border-transparent bg-warning/10' : 'border-border bg-muted'
  return (
    <section aria-label={rotulo} className={`space-y-1 rounded-lg border p-3 text-sm ${fundo}`}>
      <div className="flex flex-col items-start gap-2 sm:flex-row sm:justify-between sm:gap-3">
        <p className="font-medium">{entrega ? `${textoDaEntrega(entrega)}${sufixo ? ` ${sufixo}` : ''}` : 'Entrega não informada'}</p>
        {acao}
      </div>
      {!entrega ? semEntrega : (
        <>
          {entrega.modo === 'entregar' && (
            <>
              <p className="text-muted-foreground">{enderecoDaEntregaEmLinha(entrega.endereco)}</p>
              <p className="text-muted-foreground">Quem recebe: {entrega.recebe?.nome ?? 'o comprador'}</p>
            </>
          )}
          <p className="text-muted-foreground">Modalidade: {textoDaModalidade(entrega.modalidade) ?? 'não escolhida'}</p>
          {frete > 0 && <p className="text-muted-foreground">Frete cobrado: {brl(frete)}</p>}
        </>
      )}
    </section>
  )
}
