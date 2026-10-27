'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, Link as LinkIcon, Menu } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CATEGORIAS, ITENS, type ItemNav } from '@/lib/navegacao'
import { Sheet, SheetContent, SheetTitle } from '@/components/ui/sheet'
import { MenuUsuario, type UsuarioMenu } from './menu-usuario'
import { COOKIE_SIDEBAR_RECOLHIDA } from './sidebar-cookie'
import { PesquisaTelas } from './pesquisa-telas'


type Props = {
  itensIds: string[]
  conecta: string | null
  usuario: UsuarioMenu
  recolhidaInicial: boolean
}

function Logo({ className }: { className?: string }) {
  return (
    <>
      <img src="/brand/mova-nome-claro.svg" alt="MOVA" className={cn('h-6 w-auto dark:hidden', className)} />
      <img src="/brand/mova-nome-escuro.svg" alt="MOVA" className={cn('h-6 w-auto hidden dark:block', className)} />
    </>
  )
}

function Icone() {
  return (
    <>
      <img src="/brand/mova-icone-claro.svg" alt="MOVA" className="size-8 dark:hidden" />
      <img src="/brand/mova-icone-escuro.svg" alt="MOVA" className="size-8 hidden dark:block" />
    </>
  )
}

// Ativo pelo segmento inteiro: "/caixa" não acende em "/caixa-xyz", mas acende em "/caixa/novo".
function ativo(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function usarItens(itensIds: string[]) {
  const permitidos = new Set(itensIds)
  return ITENS.filter(i => permitidos.has(i.id))
}

function linkCls(on: boolean) {
  return cn(
    'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
    on
      ? 'bg-sidebar-accent text-sidebar-accent-foreground font-medium'
      : 'text-muted-foreground hover:bg-muted hover:text-sidebar-foreground',
  )
}

function ListaNav({ itens, conecta, onNavegar }: { itens: ItemNav[]; conecta: string | null; onNavegar?: () => void }) {
  const pathname = usePathname()
  const destaques = itens.filter(i => i.destaque)
  const grupos = CATEGORIAS
    .map(c => ({ ...c, itens: itens.filter(i => i.categoria === c.slug && !i.destaque) }))
    .filter(g => g.itens.length > 0)
  // Abre de início o grupo da tela atual; os outros ficam fechados.
  const [abertos, setAbertos] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(grupos.map(g => [g.slug, g.itens.some(i => ativo(pathname, i.href))])),
  )

  return (
    <nav className="space-y-0.5">
      {destaques.map(({ id, href, label, icon: Icon }) => (
        <Link key={id} href={href} onClick={onNavegar} className={linkCls(ativo(pathname, href))}>
          <Icon className="size-4 shrink-0" /> <span className="truncate">{label}</span>
        </Link>
      ))}
      {grupos.map(g => (
        <div key={g.slug}>
          <button
            type="button"
            onClick={() => setAbertos(a => ({ ...a, [g.slug]: !a[g.slug] }))}
            aria-expanded={!!abertos[g.slug]}
            className={linkCls(false)}
          >
            <g.icon className="size-4 shrink-0" /> <span className="truncate">{g.nome}</span>
            <ChevronDown className={cn('ml-auto size-3.5 transition-transform', !abertos[g.slug] && '-rotate-90')} />
          </button>
          {/* Itens do grupo recuados sob o ícone da categoria, com uma guia à esquerda. */}
          {abertos[g.slug] && (
            <div className="ml-5 space-y-0.5 border-l border-sidebar-border pl-2">
              {g.itens.map(({ id, href, label, icon: Icon }) => (
                <Link key={id} href={href} onClick={onNavegar} className={linkCls(ativo(pathname, href))}>
                  <Icon className="size-4 shrink-0" /> <span className="truncate">{label}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      ))}
      {conecta && (
        <a href={conecta} target="_blank" rel="noopener noreferrer" className={cn(linkCls(false), 'mt-2')}>
          <LinkIcon className="size-4 shrink-0" /> <span className="truncate">Conecta</span>
        </a>
      )}
    </nav>
  )
}

/** Barra lateral do desktop (lg+). Recolher fica num cookie para o servidor já renderizar certo. */
export function Sidebar({ itensIds, conecta, usuario, recolhidaInicial }: Props) {
  const pathname = usePathname()
  const [recolhida, setRecolhida] = useState(recolhidaInicial)
  const itens = usarItens(itensIds)
  // Só abre/renderiza o Conecta se for http(s): evita esquemas perigosos (javascript: etc.).
  const conectaSeguro = conecta && /^https?:\/\//i.test(conecta) ? conecta : null

  function alternar() {
    const nova = !recolhida
    document.cookie = `${COOKIE_SIDEBAR_RECOLHIDA}=${nova ? '1' : '0'}; path=/; max-age=31536000; samesite=lax`
    setRecolhida(nova)
  }

  return (
    <aside
      className={cn(
        'hidden lg:flex sticky top-0 z-30 h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground',
        recolhida ? 'w-16' : 'w-64',
      )}
    >
      {/* Faixa na divisa com o conteúdo: o botão de recolher só aparece com o cursor ali ou no foco. */}
      <div className="group/borda absolute inset-y-0 -right-2 z-20 w-4">
        <button
          type="button"
          onClick={alternar}
          aria-label={recolhida ? 'Expandir menu' : 'Recolher menu'}
          className="absolute top-1/2 left-1/2 grid size-6 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-border bg-card text-muted-foreground shadow-sm opacity-0 transition-opacity hover:text-foreground group-hover/borda:opacity-100 focus-visible:opacity-100"
        >
          {recolhida ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </div>

      {recolhida ? (
        <>
          <button type="button" onClick={alternar} aria-label="Expandir menu" className="mx-auto mt-4 mb-3">
            <Icone />
          </button>
          <nav className="flex flex-1 flex-col items-center gap-1 overflow-y-auto">
            {itens.filter(i => i.destaque).map(({ id, href, label, icon: Icon }) => (
              <Link key={id} href={href} title={label} aria-label={label}
                className={cn('rounded-md p-2.5', ativo(pathname, href) ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-muted-foreground hover:bg-muted hover:text-sidebar-foreground')}>
                <Icon className="size-5" />
              </Link>
            ))}
          </nav>
          <div className="flex justify-center border-t border-sidebar-border p-2">
            <MenuUsuario usuario={usuario} compacto comTema />
          </div>
        </>
      ) : (
        <>
          <div className="px-5 pt-5 pb-4"><Logo /></div>
          <div className="px-3 pb-3"><PesquisaTelas itens={itens} /></div>
          <div className="flex-1 overflow-y-auto px-2 pb-3">
            <ListaNav itens={itens} conecta={conectaSeguro} />
          </div>
          <div className="border-t border-sidebar-border p-2">
            <MenuUsuario usuario={usuario} comTema />
          </div>
        </>
      )}
    </aside>
  )
}

/** Topo do celular/tablet (< lg): botão do menu, que abre a gaveta com a mesma lista. */
export function MenuMobile({ itensIds, conecta, usuario }: Omit<Props, 'recolhidaInicial'>) {
  const [aberto, setAberto] = useState(false)
  const itens = usarItens(itensIds)
  const conectaSeguro = conecta && /^https?:\/\//i.test(conecta) ? conecta : null
  return (
    <>
    <header className="sticky top-0 z-30 flex h-14 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 lg:hidden">
      <button type="button" onClick={() => setAberto(true)} aria-label="Abrir menu" className="-ml-1 rounded-md p-2 text-sidebar-foreground hover:bg-muted">
        <Menu className="size-5" />
      </button>
      <Logo />
      <Sheet open={aberto} onOpenChange={setAberto}>
        <SheetContent side="left" className="w-[85%] max-w-xs gap-0 bg-sidebar p-0 text-sidebar-foreground">
          <SheetTitle className="px-5 pt-5 pb-4"><Logo /></SheetTitle>
          {/* Usuário no topo: no celular a gaveta é alta e a lista curta; preso no fundo, ficava um vão. */}
          <div className="border-b border-sidebar-border px-2 pb-2">
            <MenuUsuario usuario={usuario} lado="bottom" />
          </div>
          <div className="px-3 pt-3"><PesquisaTelas itens={itens} onNavegar={() => setAberto(false)} /></div>
          <div className="flex-1 overflow-y-auto px-2 py-3">
            <ListaNav itens={itens} conecta={conectaSeguro} onNavegar={() => setAberto(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </header>
    {/* Pesquisa à vista no celular, fora da gaveta; rola junto com a página para não roubar altura. */}
    <div className="border-b border-sidebar-border bg-sidebar px-3 py-2 lg:hidden">
      <PesquisaTelas itens={itens} />
    </div>
    </>
  )
}
