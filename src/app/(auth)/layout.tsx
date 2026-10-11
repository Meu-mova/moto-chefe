import { FundoOndas } from '@/components/auth/fundo-ondas'
import { NomeAnimado } from '@/components/auth/nome-animado'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mova-auth relative flex min-h-dvh items-center justify-center p-4">
      {/* Fundo preso à tela (inset-0 acompanha a área visível de verdade; unidades como lvh não
          crescem quando a barra do Chrome no iPhone se recolhe). O que ficar fora dele, ao abrir o
          teclado, aparece no verde da marca (regra html:has(.mova-auth) no globals.css). */}
      <div aria-hidden className="pointer-events-none fixed inset-0 bg-background">
        <FundoOndas />
      </div>
      <div className="relative w-full max-w-md">
        <NomeAnimado className="mx-auto mb-6 h-10 w-auto" />
        <div className="mova-subir rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-xl backdrop-blur sm:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
