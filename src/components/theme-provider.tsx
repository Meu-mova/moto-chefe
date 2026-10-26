'use client'
import { createContext, useContext, useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'
import { ThemeProvider as NextThemesProvider, useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

// Na produção o tema claro segue forçado até as telas trocarem cor fixa por cor com nome (#90):
// com o tema do sistema ligado antes disso, quem usa o celular no escuro veria telas metade
// escuras. Nos previews e no dev local o tema fica livre, com um botão para testar o escuro.
// Build sem NEXT_PUBLIC_VERCEL_ENV (next build local) conta como produção, para errar do lado seguro.
export function configTema(vercelEnv: string | undefined, nodeEnv: string | undefined) {
  const producao = vercelEnv ? vercelEnv === 'production' : nodeEnv === 'production'
  return producao ? { forcedTheme: 'light', botao: false } : { forcedTheme: undefined, botao: true }
}

const CONFIG = configTema(process.env.NEXT_PUBLIC_VERCEL_ENV, process.env.NODE_ENV)

const BotaoTemaLigado = createContext(false)

// A barra do grupo ativo põe o botão dentro dela; fora dela (páginas públicas, quem não troca de
// grupo) ele fica preso no canto. O :has esconde o do canto sem esperar hidratação.
export function useBotaoTemaLigado() {
  return useContext(BotaoTemaLigado)
}

export function BotaoTema({ local }: { local: 'barra' | 'canto' }) {
  const { resolvedTheme, setTheme } = useTheme()
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  return (
    <div
      data-botao-tema={local}
      className={cn(
        'flex shrink-0 rounded-full border border-border bg-card p-0.5 text-xs shadow-sm',
        local === 'canto' && 'fixed top-3 right-3 z-50 [:root:has([data-botao-tema=barra])_&]:hidden',
      )}
    >
      {(['light', 'dark'] as const).map((tema) => {
        const ativo = montado && resolvedTheme === tema
        const rotulo = tema === 'light' ? 'Claro' : 'Escuro'
        const Icone = tema === 'light' ? Sun : Moon
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

export function ThemeProvider({ children, config = CONFIG }: { children: React.ReactNode; config?: ReturnType<typeof configTema> }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem forcedTheme={config.forcedTheme} disableTransitionOnChange>
      <BotaoTemaLigado value={config.botao}>
        {children}
        {config.botao && <BotaoTema local="canto" />}
      </BotaoTemaLigado>
    </NextThemesProvider>
  )
}
