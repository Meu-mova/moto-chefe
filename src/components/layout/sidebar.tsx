'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, ArrowLeftRight, ShoppingCart, Wrench, Shield, Settings, ShoppingBag, Wallet, BarChart3, Home, Package, PackagePlus } from 'lucide-react'

const baseNavItems = [
  { href: '/dashboard',     label: 'Dashboard',         icon: Home            },
  { href: '/estoque',       label: 'Showroom',          icon: Package         },
  { href: '/transferencias',label: 'Transferências',    icon: ArrowLeftRight  },
  { href: '/vendas',        label: 'Vendas',            icon: ShoppingCart    },
  { href: '/ordens-servico',label: 'Ordens de Serviço', icon: Wrench          },
  { href: '/garantias',     label: 'Garantias',         icon: Shield          },
]

const adminPapeis = ['admin_geral', 'admin_socio']

type Props = { papel: string }

export function Sidebar({ papel }: Props) {
  const pathname = usePathname()
  const isAdmin = adminPapeis.includes(papel)
  const navItems = [
    ...baseNavItems,
    ...(isAdmin || papel === 'aux_adm' ? [{ href: '/caixa', label: 'Caixa', icon: Wallet }] : []),
    ...(isAdmin ? [{ href: '/financeiro', label: 'Financeiro', icon: BarChart3 }] : []),
    ...(isAdmin ? [{ href: '/entrada', label: 'Entrada', icon: PackagePlus }] : []),
    ...(isAdmin ? [{ href: '/compras', label: 'Compras', icon: ShoppingBag }] : []),
    ...(papel === 'admin_geral' ? [{ href: '/admin', label: 'Admin', icon: Settings }] : []),
  ]

  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="font-bold text-lg">MOVA</h1>
        <p className="text-xs text-slate-400 mt-1">Gestão de Motos Elétricas</p>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors',
              pathname.startsWith(href)
                ? 'bg-slate-700 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-white'
            )}
          >
            <Icon size={18} />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  )
}
