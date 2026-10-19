'use client'
import { CATEGORIAS, ITENS } from '@/lib/navegacao'
import { estado as estadoModulo, alternar as alternarModulo } from '@/lib/modulos-picker-estado'

type Props = {
  papel: string
  papeisExtras: string[]
  extras: string[]
  bloqueados: string[]
  onChange: (v: { extras: string[]; bloqueados: string[] }) => void
}

export function ModulosPicker({ papel, papeisExtras, extras, bloqueados, onChange }: Props) {
  function alternar(id: string) {
    onChange(alternarModulo(papel, papeisExtras, extras, bloqueados, id))
  }

  function estado(id: string) {
    return estadoModulo(papel, papeisExtras, extras, bloqueados, id)
  }

  const rotulo = { papel: 'do papel', liberado: 'liberado', bloqueado: 'bloqueado', sem: '' }
  const cor = {
    papel: 'text-foreground',
    liberado: 'text-primary-text font-medium',
    bloqueado: 'text-destructive line-through',
    sem: 'text-muted-foreground',
  }

  return (
    <div className="space-y-3">
      {CATEGORIAS.map(({ slug, nome }) => (
        <div key={slug}>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold mb-1">{nome}</p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {ITENS.filter(i => i.categoria === slug && !i.regraPropria).map(i => {
              const e = estado(i.id)
              return (
                <label key={i.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={e === 'papel' || e === 'liberado'}
                    onChange={() => alternar(i.id)}
                    className="rounded border-input"
                  />
                  <span className={cor[e]}>{i.label}</span>
                  {rotulo[e] && <span className="text-[10px] text-muted-foreground">{rotulo[e]}</span>}
                </label>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
