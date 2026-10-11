'use client'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Autocomplete } from '@base-ui/react/autocomplete'
import { Search } from 'lucide-react'
import { CATEGORIAS, type ItemNav } from '@/lib/navegacao'
import { telaCasa } from '@/lib/pesquisa-telas'

const NOME_CATEGORIA = Object.fromEntries(CATEGORIAS.map(c => [c.slug, c.nome]))

/**
 * Pesquisa só entre as telas que a pessoa pode abrir: recebe a mesma lista do menu
 * (`itensDoUsuario`), então nada fora da permissão aparece.
 */
export function PesquisaTelas({ itens, onNavegar }: { itens: ItemNav[]; onNavegar?: () => void }) {
  const router = useRouter()
  const [consulta, setConsulta] = useState('')

  function ir(item: ItemNav) {
    setConsulta('')
    onNavegar?.()
    router.push(item.href)
  }

  return (
    <Autocomplete.Root
      items={itens}
      value={consulta}
      onValueChange={setConsulta}
      itemToStringValue={(item: ItemNav) => item.label}
      filter={(item: ItemNav, q: string) => telaCasa(item, q)}
    >
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Autocomplete.Input
          placeholder="Buscar tela…"
          aria-label="Buscar tela"
          className="h-9 w-full rounded-md border border-input bg-card pr-3 pl-9 text-sm text-foreground placeholder:text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </div>
      <Autocomplete.Portal>
        <Autocomplete.Positioner sideOffset={4} className="z-50 w-(--anchor-width)">
          <Autocomplete.Popup className="max-h-80 overflow-y-auto rounded-lg bg-popover p-1 text-popover-foreground shadow-md ring-1 ring-foreground/10">
            <Autocomplete.Empty className="px-3 py-2 text-sm text-muted-foreground empty:hidden">
              {consulta && `Nenhuma tela com “${consulta}”.`}
            </Autocomplete.Empty>
            <Autocomplete.List>
              {(item: ItemNav) => (
                <Autocomplete.Item
                  key={item.id}
                  value={item}
                  onClick={() => ir(item)}
                  className="flex cursor-default items-center gap-2 rounded-md px-2 py-2 text-sm outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground"
                >
                  <item.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{item.label}</span>
                  {item.categoria && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{NOME_CATEGORIA[item.categoria]}</span>
                  )}
                </Autocomplete.Item>
              )}
            </Autocomplete.List>
          </Autocomplete.Popup>
        </Autocomplete.Positioner>
      </Autocomplete.Portal>
    </Autocomplete.Root>
  )
}
