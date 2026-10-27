'use client'
import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// Padrão claro e sem seguir o sistema do aparelho (decisão do Luis, #90): o escuro só entra por
// escolha de quem usa, salva no navegador.
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}

export const TEMAS = [
  { tema: 'light', rotulo: 'Claro', Icone: Sun },
  { tema: 'dark', rotulo: 'Escuro', Icone: Moon },
] as const

/** Tema em uso; `undefined` até hidratar, para nenhum botão aparecer marcado errado. */
export function useTemaAtivo() {
  const { resolvedTheme, setTheme } = useTheme()
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  return { temaAtivo: montado ? resolvedTheme : undefined, setTheme }
}

// No desktop o tema fica no menu do usuário; este botão é do celular. A barra do grupo ativo põe o
// botão dentro dela; sem a barra (quem não troca de grupo) ele fica preso no canto. O :has esconde
// o do canto sem esperar hidratação.
export function BotaoTema({ local }: { local: 'barra' | 'canto' }) {
  const { temaAtivo, setTheme } = useTemaAtivo()
  return (
    <div
      data-botao-tema={local}
      className={cn(
        'flex shrink-0 rounded-full border border-border bg-card p-0.5 text-xs shadow-sm lg:hidden',
        local === 'canto' && 'fixed top-3 right-3 z-50 [:root:has([data-botao-tema=barra])_&]:hidden',
      )}
    >
      {TEMAS.map(({ tema, rotulo, Icone }) => {
        const ativo = temaAtivo === tema
        return (
          <button
            key={tema}
            type="button"
            aria-pressed={ativo}
            aria-label={rotulo}
            onClick={() => setTheme(tema)}
            className={cn(
              'inline-flex items-center gap-1 rounded-full p-2 sm:px-2.5 sm:py-1',
              ativo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Icone className="size-3.5 sm:hidden" aria-hidden />
            <span className="hidden sm:inline">{rotulo}</span>
          </button>
        )
      })}
    </div>
  )
}
