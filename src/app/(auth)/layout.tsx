import { FundoOndas } from '@/components/auth/fundo-ondas'
import { NomeAnimado } from '@/components/auth/nome-animado'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mova-auth relative flex min-h-dvh items-center justify-center p-4">
      {/* Fundo preso à tela e com um bloco verde abaixo: no iPhone, o teclado e o "elástico" ao
          arrastar revelam a área além do fim da página, que antes aparecia como faixa clara. */}
      <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 bg-background">
        <div className="relative h-lvh"><FundoOndas /></div>
        <div className="h-lvh bg-linear-to-r from-(--brand-1) to-(--brand-2)" />
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
