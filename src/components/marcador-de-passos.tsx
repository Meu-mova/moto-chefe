import { cn } from '@/lib/utils'

/**
 * "1. Nome  2. Nome  3. Nome", com o passo atual em destaque. Com `onIr`, cada passo é um botão que
 * leva a ele; `legenda` acrescenta uma linha pequena embaixo do nome.
 */
export function MarcadorDePassos({ nomes, atual, onIr, legenda }: {
  nomes: string[]
  atual: number
  onIr?: (i: number) => void
  legenda?: (i: number) => React.ReactNode
}) {
  return (
    <ol className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${nomes.length}, minmax(0, 1fr))` }}>
      {nomes.map((nome, i) => {
        const classe = cn(
          'block w-full rounded-md px-1 py-1.5 text-center text-xs',
          i === atual ? 'bg-primary font-semibold text-primary-foreground' : 'bg-muted text-muted-foreground',
        )
        const conteudo = <>{i + 1}. {nome}{legenda?.(i)}</>
        const atributos = { 'aria-current': i === atual ? 'step' as const : undefined, className: classe }
        return (
          <li key={nome}>
            {onIr ? <button type="button" onClick={() => onIr(i)} {...atributos}>{conteudo}</button> : <span {...atributos}>{conteudo}</span>}
          </li>
        )
      })}
    </ol>
  )
}
