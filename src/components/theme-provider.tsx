'use client'
import { useEffect, useState } from 'react'
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

function BotaoTema() {
  const { resolvedTheme, setTheme } = useTheme()
  const [montado, setMontado] = useState(false)
  useEffect(() => setMontado(true), [])
  return (
    <div
      data-botao-tema
      className="fixed bottom-3 right-3 z-50 flex rounded-full border border-border bg-card p-0.5 text-xs shadow-sm opacity-70 hover:opacity-100"
    >
      {(['light', 'dark'] as const).map((tema) => {
        const ativo = montado && resolvedTheme === tema
        return (
          <button
            key={tema}
            type="button"
            aria-pressed={ativo}
            onClick={() => setTheme(tema)}
            className={cn(
              'rounded-full px-2.5 py-1',
              ativo ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {tema === 'light' ? 'Claro' : 'Escuro'}
          </button>
        )
      })}
    </div>
  )
}

export function ThemeProvider({ children, config = CONFIG }: { children: React.ReactNode; config?: ReturnType<typeof configTema> }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="light" enableSystem forcedTheme={config.forcedTheme} disableTransitionOnChange>
      {children}
      {config.botao && <BotaoTema />}
    </NextThemesProvider>
  )
}
