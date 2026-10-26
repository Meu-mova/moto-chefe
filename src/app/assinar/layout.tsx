import type { Metadata } from 'next'

// noindex: o link é pessoal e contém dados do cliente. Nada de buscador.
export const metadata: Metadata = {
  title: 'Assinatura de documento',
  robots: { index: false, follow: false },
}

export default function AssinarLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-muted">{children}</div>
}
