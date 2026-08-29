'use client'
import { CATEGORIAS, ITENS, type Papel } from '@/lib/navegacao'

type Props = {
  papel: string
  extras: string[]
  bloqueados: string[]
  onChange: (v: { extras: string[]; bloqueados: string[] }) => void
}

export function ModulosPicker({ papel, extras, bloqueados, onChange }: Props) {
  const doPapel = (id: string) =>
    ITENS.find(i => i.id === id)?.papeis.includes(papel as Papel) ?? false

  // Dois estados, e o significado depende do papel dar ou não o módulo:
  // o que o papel dá alterna entre "do papel" e "bloqueado"; o que ele não dá
  // alterna entre "não tem" e "liberado". Só a diferença é gravada.
  function alternar(id: string) {
    if (doPapel(id)) {
      onChange({
        extras,
        bloqueados: bloqueados.includes(id)
          ? bloqueados.filter(x => x !== id)
          : [...bloqueados, id],
      })
    } else {
      onChange({
        extras: extras.includes(id) ? extras.filter(x => x !== id) : [...extras, id],
        bloqueados,
      })
    }
  }

  function estado(id: string): 'papel' | 'liberado' | 'bloqueado' | 'sem' {
    if (bloqueados.includes(id)) return 'bloqueado'
    if (doPapel(id)) return 'papel'
    if (extras.includes(id)) return 'liberado'
    return 'sem'
  }

  const rotulo = { papel: 'do papel', liberado: 'liberado', bloqueado: 'bloqueado', sem: '' }
  const cor = {
    papel: 'text-slate-700',
    liberado: 'text-green-700 font-medium',
    bloqueado: 'text-red-600 line-through',
    sem: 'text-slate-400',
  }

  return (
    <div className="space-y-3">
      {CATEGORIAS.map(({ slug, nome }) => (
        <div key={slug}>
          <p className="text-[11px] uppercase tracking-wide text-slate-400 font-semibold mb-1">{nome}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {ITENS.filter(i => i.categoria === slug && !i.regraPropria).map(i => {
              const e = estado(i.id)
              return (
                <label key={i.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={e === 'papel' || e === 'liberado'}
                    onChange={() => alternar(i.id)}
                    className="rounded border-slate-300"
                  />
                  <span className={cor[e]}>{i.label}</span>
                  {rotulo[e] && <span className="text-[10px] text-slate-400">{rotulo[e]}</span>}
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
