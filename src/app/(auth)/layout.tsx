import { FundoOndas } from '@/components/auth/fundo-ondas'
import { NomeAnimado } from '@/components/auth/nome-animado'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-background p-4">
      <FundoOndas />
      <div className="relative w-full max-w-md">
        <NomeAnimado className="mx-auto mb-6 h-10 w-auto" />
        <div className="mova-subir rounded-2xl border border-border bg-card/95 p-6 text-card-foreground shadow-xl backdrop-blur sm:p-8">
          {children}
        </div>
      </div>
    </div>
  )
}
