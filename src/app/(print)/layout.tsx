// Papel é sempre claro: o tema-claro devolve as cores do claro aqui dentro, mesmo com o escuro ligado.
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div data-impresso className="tema-claro min-h-dvh bg-card text-foreground">{children}</div>
}
