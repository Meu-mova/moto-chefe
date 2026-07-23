'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from '@/components/ui/tooltip'
import {
  ArrowLeftRight, ShoppingCart, Wrench, Shield, Settings,
  Wallet, Home, Package, QrCode, Calculator,
  ChevronLeft, ChevronRight, Zap, CreditCard, ClipboardList, Users,
  Radar, CalendarDays, ListChecks, Package2, Link as LinkIcon,
} from 'lucide-react'

const baseNavItems = [
  { href: '/dashboard',      label: 'Dashboard',         icon: Home           },
  { href: '/estoque',        label: 'Showroom',          icon: Package        },
  { href: '/transferencias', label: 'Transferências',    icon: ArrowLeftRight },
  { href: '/vendas',         label: 'Vendas',            icon: ShoppingCart   },
  { href: '/agenda',         label: 'Agenda',            icon: CalendarDays   },
  { href: '/ordens-servico', label: 'Ordens de Serviço', icon: Wrench         },
  { href: '/garantias',      label: 'Garantias',         icon: Shield         },
  { href: '/simulador',      label: 'Simulador',         icon: Calculator     },
  { href: '/radar',          label: 'RADAR',             icon: Radar          },
]

const adminPapeis = ['admin_geral', 'admin_socio']
const PAPEIS_PIX_MCP = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

type Props = { papel: string; conecta: string | null }

export function Sidebar({ papel, conecta }: Props) {
  const pathname = usePathname()
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)

  // Só renderiza/abre o link Conecta se for http(s) — evita esquemas perigosos (javascript:, etc.)
  const conectaSeguro = conecta && /^https?:\/\//i.test(conecta) ? conecta : null

  const isAdmin = adminPapeis.includes(papel)
  const navItems = [
    ...baseNavItems,
    ...(isAdmin || papel === 'aux_adm' ? [{ href: '/caixa',       label: 'Caixa',       icon: Wallet       }] : []),
    // ValidaPix (/pix) abolido do menu — código/dados mantidos intactos, revertível.
    ...(PAPEIS_PIX_MCP.includes(papel) ? [{ href: '/pix-mcp',     label: 'PIX',         icon: QrCode       }] : []),
    ...(isAdmin || papel === 'aux_adm' ? [{ href: '/conciliacao', label: 'Conciliação', icon: CreditCard   }] : []),
    ...(papel !== 'mecanico'           ? [{ href: '/demandas',    label: 'Demandas',    icon: ClipboardList }] : []),
    ...(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(papel) ? [{ href: '/clientes', label: 'Clientes', icon: Users }] : []),
    ...(['admin_geral', 'admin_socio', 'aux_adm'].includes(papel) ? [{ href: '/servicos', label: 'Serviços', icon: ListChecks }] : []),
    ...(['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(papel) ? [{ href: '/pecas', label: 'Peças', icon: Package2 }] : []),
    ...(isAdmin ? [{ href: '/admin', label: 'Admin', icon: Settings }] : []),
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
          {navItems.map(({ href, label, icon: Icon }) => {
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
