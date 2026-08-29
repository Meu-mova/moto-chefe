'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import { ChevronLeft, ChevronRight, Zap, Link as LinkIcon } from 'lucide-react'
import { CATEGORIAS, ITENS } from '@/lib/navegacao'

type Props = { itensIds: string[]; conecta: string | null }

export function Sidebar({ itensIds, conecta }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  // Só renderiza/abre o link Conecta se for http(s) — evita esquemas perigosos (javascript:, etc.)
  const conectaSeguro = conecta && /^https?:\/\//i.test(conecta) ? conecta : null

  const permitidos = new Set(itensIds)
  const itens = ITENS.filter(i => permitidos.has(i.id))

  // Linhas do menu: destaques soltos, depois uma linha por categoria.
  // Categoria com um item só vira link direto — hub com um card é ruído.
  const destaques = itens.filter(i => i.destaque)
  const linhasCategoria = CATEGORIAS.flatMap(({ slug, nome, icon }) => {
    const daCategoria = itens.filter(i => i.categoria === slug)
    if (daCategoria.length === 0) return []
    if (daCategoria.length === 1) {
      const unico = daCategoria[0]
      return [{ href: unico.href, label: unico.label, icon: unico.icon, hub: false }]
    }
    return [{ href: `/areas/${slug}`, label: nome, icon, hub: true }]
  })
  const linhas = [
    ...destaques.map(i => ({ href: i.href, label: i.label, icon: i.icon, hub: false })),
    ...linhasCategoria,
  ]

  return (
    <aside
      className={cn(
        'min-h-screen bg-slate-900 text-white flex flex-col transition-all duration-300 ease-in-out shrink-0',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo / título */}
      <div className={cn(
        'border-b border-slate-700 flex items-center gap-3 transition-all duration-300',
        collapsed ? 'px-0 py-4 justify-center' : 'px-5 py-5'
      )}>
        <Zap size={20} className="text-emerald-400 shrink-0" />
        {!collapsed && (
          <div className="overflow-hidden">
            <h1 className="font-bold text-base leading-tight whitespace-nowrap">MOVA</h1>
            <p className="text-[11px] text-slate-400 mt-0.5 whitespace-nowrap">Gestão em Mobilidade Elétrica</p>
          </div>
        )}
      </div>

      {/* Navegação */}
      <TooltipProvider delay={100}>
        <nav className="flex-1 p-3 space-y-0.5">
          {linhas.map(({ href, label, icon: Icon, hub }) => {
            const active = pathname.startsWith(href)
            const linkClass = cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              collapsed && 'justify-center px-0',
              active
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )

            if (collapsed) {
              return (
                <Tooltip key={href}>
                  <TooltipTrigger
                    onClick={() => router.push(href)}
                    className={linkClass}
                  >
                    <Icon size={18} />
                  </TooltipTrigger>
                  <TooltipContent side="right">{label}</TooltipContent>
                </Tooltip>
              )
            }

            return (
              <Link key={href} href={href} className={linkClass}>
                <Icon size={18} className="shrink-0" />
                <span className="truncate">{label}</span>
                {hub && <ChevronRight size={14} className="ml-auto opacity-50" />}
              </Link>
            )
          })}
          {conectaSeguro && (() => {
            const linkClass = cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              collapsed && 'justify-center px-0',
              'text-slate-400 hover:bg-slate-800 hover:text-white'
            )
            if (collapsed) {
              return (
                <Tooltip>
                  <TooltipTrigger
                    onClick={() => window.open(conectaSeguro, '_blank', 'noopener')}
                    className={linkClass}
                  >
                    <LinkIcon size={18} />
                  </TooltipTrigger>
                  <TooltipContent side="right">Conecta</TooltipContent>
                </Tooltip>
              )
            }
            return (
              <a href={conectaSeguro} target="_blank" rel="noopener noreferrer" className={linkClass}>
                <LinkIcon size={18} className="shrink-0" />
                <span className="truncate">Conecta</span>
              </a>
            )
          })()}
        </nav>
      </TooltipProvider>

      {/* Botão retrair */}
      <div className="p-3 border-t border-slate-700">
        <button
          onClick={() => setCollapsed(prev => !prev)}
          className={cn(
            'flex items-center gap-2 w-full px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors',
            collapsed && 'justify-center px-0'
          )}
        >
          {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Recolher menu</span></>}
        </button>
      </div>
    </aside>
  )
}
