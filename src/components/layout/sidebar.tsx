'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { LayoutDashboard, ArrowLeftRight, ShoppingCart, Wrench, Shield, Settings } from 'lucide-react'

const navItems = [
  { href: '/estoque', label: 'Estoque', icon: LayoutDashboard },
  { href: '/transferencias', label: 'Transferências', icon: ArrowLeftRight },
  { href: '/vendas', label: 'Vendas', icon: ShoppingCart },
  { href: '/ordens-servico', label: 'Ordens de Serviço', icon: Wrench },
  { href: '/garantias', label: 'Garantias', icon: Shield },
  { href: '/admin', label: 'Admin', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  return (
    <aside className="w-64 min-h-screen bg-slate-900 text-white flex flex-col">
      <div className="p-6 border-b border-slate-700">
        <h1 className="font-bold text-lg">Moto Elétrica</h1>
        <p className="text-xs text-slate-400 mt-1">Gestão de Estoque</p>
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
