'use client'
import { MODALIDADES_FRETE, type ModalidadeFrete } from '@/lib/notagateway/transporte'

type Props = {
  id: string
  valor: ModalidadeFrete | ''
  onChange: (modalidade: ModalidadeFrete | '') => void
  /** Texto da opção vazia: nenhuma modalidade vem marcada (#682). */
  placeholder: string
}

/** Lista das modalidades do frete da NF-e 4.0 em linguagem simples, a mesma no Novo pedido e no faturamento direto. */
export function ModalidadeFreteSelect({ id, valor, onChange, placeholder }: Props) {
  return (
    <select id={id} value={valor} onChange={e => onChange(e.target.value as ModalidadeFrete | '')} className="h-10 w-full rounded-md border border-input bg-background px-3 text-base sm:text-sm">
      <option value="">{placeholder}</option>
      {MODALIDADES_FRETE.map(m => <option key={m.token} value={m.token}>{m.texto}</option>)}
    </select>
  )
}
