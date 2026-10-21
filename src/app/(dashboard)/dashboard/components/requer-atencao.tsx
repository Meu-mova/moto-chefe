import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// Peças da seção "Requer atenção" (#281): grupos com título pequeno e linhas rótulo · número.
// A cor de alerta fica só no número, e só quando há algo a fazer.

/** escondeVazia: some quando nenhum grupo (h3) apareceu; os blocos carregam cada um no seu Suspense. */
export function Secao({ titulo, acao, escondeVazia, children }: { titulo: string; acao?: React.ReactNode; escondeVazia?: boolean; children: React.ReactNode }) {
  return (
    <section className={`min-w-0 ${escondeVazia ? '[&:not(:has(h3))]:hidden' : ''}`}>
      <h2 className="flex items-baseline justify-between gap-2 border-b-2 border-foreground pb-1.5 text-[15px] font-bold text-foreground">
        {titulo}
        {acao}
      </h2>
      {children}
    </section>
  )
}

export function TituloGrupo({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-2 pt-3 pb-0.5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      {acao}
    </div>
  )
}

export function LinhaPendencia({ rotulo, valor, href }: { rotulo: string; valor: number; href: string }) {
  return (
    <Link href={href} className="flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm text-foreground hover:bg-muted">
      <span>{rotulo}</span>
      <span className="flex shrink-0 items-center gap-1">
        <span className={`tabular-nums ${valor > 0 ? 'text-[15px] font-bold text-warning' : 'text-muted-foreground'}`}>{valor}</span>
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </span>
    </Link>
  )
}
