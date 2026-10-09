'use client'
import Link from 'next/link'
import { ChevronsUpDown, LogOut, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { logoutAction } from '@/app/(auth)/login/actions'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type UsuarioMenu = { nome: string; email: string; papel: string }

const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Admin Geral',
  admin_socio: 'Admin Sócio',
  aux_adm: 'Aux. Administrativo',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
  motorista: 'Motorista',
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

/** Rodapé da barra lateral: avatar e nome; o clique abre, para cima, os dados da conta e o sair. */
export function MenuUsuario({ usuario, compacto }: { usuario: UsuarioMenu; compacto?: boolean }) {
  const avatar = (
    <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
      {iniciais(usuario.nome)}
    </span>
  )
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Menu do usuário"
        className={cn(
          'flex items-center gap-2 rounded-md text-left hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring',
          compacto ? 'p-1.5' : 'w-full px-2 py-1.5',
        )}
      >
        {avatar}
        {!compacto && (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{usuario.nome}</span>
              <span className="block truncate text-xs text-muted-foreground">{PAPEL_LABEL[usuario.papel] ?? usuario.papel}</span>
            </span>
            <ChevronsUpDown className="size-4 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5">
            <span className="block text-sm font-medium text-foreground">{usuario.nome}</span>
            <span className="block truncate text-xs">{usuario.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="px-2 py-1.5" render={<Link href="/completar-cadastro" />}>
          <UserRound /> Meus dados
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="px-2 py-1.5" onClick={() => logoutAction()}>
          <LogOut /> Sair
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
