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

export type Coluna<T> = {
  titulo: string
  valor: (linha: T) => React.ReactNode
  direita?: boolean
  /** Só no desktop (lg); abaixo disso o valor vai para a linha de detalhe. */
  secundaria?: boolean
  /** A coluna que recebe a linha de detalhe (o nome do item); sem nenhuma, a 1ª. */
  principal?: boolean
  /** Explicação no cabeçalho (title) e, quando o título é um símbolo, o nome lido pelo leitor de tela. */
  dica?: string
  classe?: string
}

/**
 * Tabela das seções do dashboard. Abaixo do desktop as colunas secundárias saem da linha
 * e o que elas mostravam vai para `detalhe`, embaixo da 1ª coluna: nada some no celular.
 */
export function TabelaPainel<T>({ rotulo, linhas, colunas, chave, vazio, detalhe, destaque }: {
  /** Nome da tabela para o leitor de tela (o título da seção). */
  rotulo: string
  linhas: T[]
  colunas: Coluna<T>[]
  chave: (linha: T) => string
  vazio: string
  detalhe?: (linha: T) => React.ReactNode
  destaque?: (linha: T) => boolean
}) {
  if (linhas.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{vazio}</p>
  const iPrincipal = Math.max(0, colunas.findIndex(c => c.principal))
  return (
    // A rolagem fica na tabela, se um dia não couber: a página nunca rola na horizontal.
    <div className="overflow-x-auto">
    <table aria-label={rotulo} className="mt-1 w-full text-sm">
      <thead>
        <tr className="border-b border-border text-xs text-muted-foreground">
          {colunas.map((c, i) => (
            <th key={i} scope="col" title={c.dica} aria-label={c.dica && c.titulo.length <= 2 ? c.dica : undefined}
              className={`py-2 pr-3 font-semibold last:pr-0 ${c.direita ? 'text-right' : 'text-left'} ${c.secundaria ? 'hidden lg:table-cell' : ''}`}>{c.titulo}</th>
          ))}
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {linhas.map(l => (
          <tr key={chave(l)} className={destaque?.(l) ? 'bg-primary-soft font-medium' : 'hover:bg-muted'}>
            {colunas.map((c, i) => (
              <td key={i} className={`py-2 pr-3 align-top tabular-nums last:pr-0 ${c.direita ? 'text-right' : ''} ${c.secundaria ? 'hidden lg:table-cell' : ''} ${c.classe ?? ''}`}>
                {c.valor(l)}
                {i === iPrincipal && detalhe && <span className="mt-0.5 block text-xs text-muted-foreground lg:hidden">{detalhe(l)}</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  )
}
