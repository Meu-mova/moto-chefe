'use client'
import { ThemeProvider as NextThemesProvider } from 'next-themes'

// Tema claro forçado até as telas trocarem cor fixa (bg-slate-*, bg-white) por cor com nome
// (#90). Com o tema do sistema ligado antes disso, quem usa o celular no escuro veria telas
// metade escuras. A troca para defaultTheme="system" sai com a migração das telas.
const TEMA_FORCADO = 'light'

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem forcedTheme={TEMA_FORCADO} disableTransitionOnChange>
      {children}
    </NextThemesProvider>
  )
}
