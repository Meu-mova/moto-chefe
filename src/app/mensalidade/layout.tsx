import { Providers } from '@/lib/providers'

// A /mensalidade fica fora do layout do painel; sem o Toaster dos Providers, o erro do "Pagar" some (#773).
export default function MensalidadeLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>
}
