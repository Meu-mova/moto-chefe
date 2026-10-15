'use client'
import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { cn } from '@/lib/utils'

const ATALHOS = ['Hoje', '7 dias', 'Mês', 'Personalizado'] as const
type Atalho = (typeof ATALHOS)[number]

function somaDias(iso: string, dias: number) {
  const d = new Date(iso + 'T00:00:00.000Z')
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().split('T')[0]
}

/** Intervalo de cada atalho a partir de "hoje" (AAAA-MM-DD). Personalizado não tem intervalo fixo. */
function intervalo(a: Exclude<Atalho, 'Personalizado'>, hoje: string): [string, string] {
  if (a === 'Hoje') return [hoje, hoje]
  if (a === '7 dias') return [somaDias(hoje, -6), hoje]
  return [hoje.slice(0, 8) + '01', hoje]
}

type Props = {
  from: string
  to: string
  hoje: string
  /** Menor data aceita (início da conciliação, por exemplo). */
  min?: string
  /** Nomes dos parâmetros na URL; mudam na aba de saídas de despesas (sfrom/sto). */
  chaveDe?: string
  chaveAte?: string
  /** Conteúdo encostado à direita da linha, do tablet para cima. */
  direita?: React.ReactNode
  className?: string
}

/**
 * Período por atalhos. O atalho ativo vem do intervalo da URL; as datas só aparecem em "Personalizado"
 * (campos de 16px no celular, ao lado do seletor do tablet para cima).
 */
export function PeriodoAtalhos({ from, to, hoje, min, chaveDe = 'from', chaveAte = 'to', direita, className }: Props) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const atual: Atalho = (['Hoje', '7 dias', 'Mês'] as const).find(a => {
    const [de, ate] = intervalo(a, hoje)
    return de === from && ate === to
  }) ?? 'Personalizado'
  const [abertoPersonalizado, setAbertoPersonalizado] = useState(false)
  const [de, setDe] = useState(from)
  const [ate, setAte] = useState(to)
  // A URL manda: ao mudar o período (atalho, Aplicar, voltar do navegador) os campos acompanham.
  useEffect(() => {
    setDe(from)
    setAte(to)
    setAbertoPersonalizado(false)
  }, [from, to])
  const mostrarDatas = abertoPersonalizado || atual === 'Personalizado'

  function ir(novoDe: string, novoAte: string) {
    const p = new URLSearchParams(params.toString())
    p.set(chaveDe, min && novoDe < min ? min : novoDe)
    p.set(chaveAte, novoAte)
    // Sem isto o ?sync=1 ficaria na URL e cada troca de período refaria a sincronização forçada.
    p.delete('sync')
    router.push(`${pathname}?${p.toString()}`)
  }

  function escolher(a: Atalho) {
    if (a === 'Personalizado') {
      setAbertoPersonalizado(true)
      return
    }
    setAbertoPersonalizado(false)
    const [novoDe, novoAte] = intervalo(a, hoje)
    ir(novoDe, novoAte)
  }

  // appearance-none: o Safari/Chrome do iPhone ignoram a largura do <input type=date> sem isso e o campo vaza sobre o vizinho.
  const campo = 'mt-1 block h-11 w-full min-w-0 max-w-full appearance-none text-left rounded-lg border border-input bg-card px-2 text-base text-foreground md:h-9 md:w-40 md:rounded-md md:text-sm'
  return (
    <div className={cn('flex flex-col items-stretch gap-3 md:flex-row md:flex-wrap md:items-end', className)}>
      <div role="group" aria-label="Período" className="flex rounded-lg bg-muted p-0.5 md:inline-flex">
        {ATALHOS.map(a => {
          const ativo = mostrarDatas ? a === 'Personalizado' : a === atual
          return (
            <button key={a} type="button" onClick={() => escolher(a)} aria-pressed={ativo}
              className={cn('h-10 flex-1 whitespace-nowrap rounded-md px-3 text-sm md:h-8', ativo ? 'bg-card font-medium shadow-sm' : 'text-muted-foreground')}>
              {a}
            </button>
          )
        })}
      </div>
      {mostrarDatas && (
        // Celular: De/Até em duas colunas iguais e Aplicar em linha própria (três itens na mesma linha cortavam a data).
        <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:items-end md:gap-3">
          <label className="min-w-0 text-xs text-muted-foreground">De<input type="date" value={de} min={min} onChange={e => setDe(e.target.value)} className={campo} /></label>
          <label className="min-w-0 text-xs text-muted-foreground">Até<input type="date" value={ate} min={min} onChange={e => setAte(e.target.value)} className={campo} /></label>
          <button type="button" onClick={() => ir(de, ate)} disabled={!de || !ate || ate < de}
            className="col-span-2 h-11 rounded-lg bg-primary px-4 text-base font-medium text-primary-foreground disabled:opacity-50 md:col-span-1 md:h-9 md:rounded-md md:text-sm">
            Aplicar
          </button>
        </div>
      )}
      {direita && <div className="hidden md:ml-auto md:block">{direita}</div>}
    </div>
  )
}
