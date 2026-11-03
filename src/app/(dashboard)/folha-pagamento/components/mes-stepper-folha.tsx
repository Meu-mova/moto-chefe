'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { hrefComFiltro, mesAdjacente, rotuloMes } from '@/lib/folha-tela'

// Botões em vez de <input type="month">, que o Safari não trata como seletor de mês.
// Trocar o mês mantém a loja (e qualquer outro filtro) da URL.
export function MesStepperFolha({ mesAtual }: { mesAtual: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [pendente, startTransition] = useTransition()
  // `mesAtual` só muda quando a navegação termina: sem travar, dois cliques rápidos iriam ao mesmo mês.
  const ir = (delta: number) => startTransition(() =>
    router.push(hrefComFiltro(pathname, searchParams.toString(), 'mes', mesAdjacente(mesAtual, delta))))
  const botao = 'size-11 @[960px]/folha:size-9'

  return (
    <div role="group" aria-label="Mês" className="flex items-center rounded-md border border-input bg-card">
      <Button variant="ghost" size="icon" className={botao} aria-label="Mês anterior" disabled={pendente} onClick={() => ir(-1)}>
        <ChevronLeft />
      </Button>
      <span className="min-w-max flex-1 px-1 text-center text-sm font-medium">{rotuloMes(mesAtual)}</span>
      <Button variant="ghost" size="icon" className={botao} aria-label="Mês seguinte" disabled={pendente} onClick={() => ir(1)}>
        <ChevronRight />
      </Button>
    </div>
  )
}
