import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

// Seções do dashboard (#281). A cor de alerta fica só no número, e só quando há algo a fazer.

/**
 * escondeVazia: some quando nenhum TituloGrupo apareceu. Os blocos carregam cada um no seu
 * Suspense, então só o navegador sabe se algum tem o que mostrar.
 */
export function Secao({ titulo, acao, escondeVazia, children }: { titulo: string; acao?: React.ReactNode; escondeVazia?: boolean; children: React.ReactNode }) {
  return (
    <section className={`min-w-0 ${escondeVazia ? '[&:not(:has([data-grupo]))]:hidden' : ''}`}>
      <div className="flex items-baseline justify-between gap-2 border-b-2 border-foreground pb-1.5">
        <h2 className="text-base font-bold text-foreground">{titulo}</h2>
        {acao}
      </div>
      {children}
    </section>
  )
}

export function TituloGrupo({ children, acao }: { children: React.ReactNode; acao?: React.ReactNode }) {
  return (
    <div data-grupo className="flex items-center justify-between gap-2 pt-3 pb-0.5">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</h3>
      {acao}
    </div>
  )
}

const LINHA = 'flex items-baseline justify-between gap-3 border-b border-border py-2.5 text-sm'
const NUMERO_ALERTA = 'text-base font-bold tabular-nums text-warning'

/** Linha sem link: rótulo à esquerda, valor à direita; alerta pinta só o valor. */
export function LinhaValor({ rotulo, alerta, children }: { rotulo: string; alerta?: boolean; children: React.ReactNode }) {
  return (
    <div className={LINHA}>
      <span className="text-muted-foreground">{rotulo}</span>
      <span className={alerta ? NUMERO_ALERTA : 'font-semibold tabular-nums text-foreground'}>{children}</span>
    </div>
  )
}

export function LinhaPendencia({ rotulo, valor, href }: { rotulo: string; valor: number; href: string }) {
  return (
    <Link href={href} className={`${LINHA} text-foreground hover:bg-muted`}>
      <span>{rotulo}</span>
      <span className="flex shrink-0 items-center gap-1">
        <span className={valor > 0 ? NUMERO_ALERTA : 'tabular-nums text-muted-foreground'}>{valor}</span>
        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
      </span>
    </Link>
  )
}
