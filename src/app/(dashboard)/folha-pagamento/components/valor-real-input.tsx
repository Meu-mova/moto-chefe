'use client'
import { useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { parseNumeroBR } from '@/lib/numero-br'
import { salvarValorRealAction } from '../actions'

// Campo da última coluna da folha: o que a contabilidade pagou de verdade.
//
// Salva ao sair do campo (ou no Enter) e não a cada tecla — a folha inteira é
// preenchida de cima a baixo com Tab, e gravar por tecla dispararia uma
// revalidação da página mais pesada do sistema a cada dígito.

const fmt = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function ValorRealInput({
  usuarioId, mes, valorReal, totalPagar,
}: {
  usuarioId: string
  mes: string
  valorReal: number | null
  totalPagar: number
}) {
  const [texto, setTexto] = useState(valorReal !== null ? fmt(valorReal) : '')
  // O último valor que o banco confirmou. Sair do campo sem mexer não grava nada,
  // e é o que faz percorrer a coluna com Tab não disparar 12 escritas inúteis.
  const salvo = useRef(valorReal)
  const [pending, startTransition] = useTransition()

  function salvar() {
    const cru = texto.trim()
    const novo = cru === '' ? null : parseNumeroBR(cru)

    if (cru !== '' && novo === null) {
      toast.error('Valor inválido')
      setTexto(salvo.current !== null ? fmt(salvo.current) : '')
      return
    }
    if (novo === salvo.current) {
      setTexto(novo !== null ? fmt(novo) : '')
      return
    }

    startTransition(async () => {
      try {
        await salvarValorRealAction({ usuarioId, mes, valor: novo })
        salvo.current = novo
        setTexto(novo !== null ? fmt(novo) : '')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao salvar o valor pago')
        setTexto(salvo.current !== null ? fmt(salvo.current) : '')
      }
    })
  }

  // A diferença sai do valor já gravado, não do que está sendo digitado: no meio
  // da digitação ("1.4") ela piscaria um número sem sentido.
  const diferenca = salvo.current !== null ? salvo.current - totalPagar : null
  // Centavo de arredondamento não é divergência.
  const bate = diferenca !== null && Math.abs(diferenca) < 0.005

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Input
        value={texto}
        onChange={e => setTexto(e.target.value)}
        onBlur={salvar}
        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur() }}
        disabled={pending}
        inputMode="decimal"
        placeholder="—"
        aria-label="Valor real pago"
        className="h-8 w-28 text-right tabular-nums"
      />
      {diferenca !== null && (
        bate
          ? <span className="text-[11px] text-success">ok</span>
          : <span className="text-[11px] text-destructive whitespace-nowrap">
              {diferenca > 0 ? '+' : '-'}{fmt(Math.abs(diferenca))} vs calc.
            </span>
      )}
    </div>
  )
}
