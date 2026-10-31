'use client'
import Link from 'next/link'
import { ChevronsUpDown, LogOut, UserRound } from 'lucide-react'
import { Menu as MenuPrimitive } from '@base-ui/react/menu'
import { cn } from '@/lib/utils'
import { TEMAS, useTemaAtivo } from '@/components/theme-provider'
import { logoutAction } from '@/app/(auth)/login/actions'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuRadioGroup, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

export type UsuarioMenu = { nome: string; email: string; papel: string }

const PAPEL_LABEL: Record<string, string> = {
  admin_geral: 'Admin Geral',
  admin_socio: 'Admin Sócio',
  admin_rede: 'Admin de Rede',
  aux_adm: 'Aux. Administrativo',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
  motorista: 'Motorista',
}

function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/)
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase()
}

// Claro|Escuro dentro do menu: escolher não fecha o menu, para ver a troca e voltar atrás.
// RadioItem cru, não o DropdownMenuRadioItem: aquele desenha a lista com o check, aqui é uma pílula.
function ItemTema() {
  const { temaAtivo, setTheme } = useTemaAtivo()
  return (
    <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-sm">
      <span id="menu-usuario-tema">Tema</span>
      <DropdownMenuRadioGroup
        aria-labelledby="menu-usuario-tema"
        value={temaAtivo ?? ''}
        onValueChange={(tema) => setTheme(tema)}
        className="flex rounded-full border border-border bg-muted p-0.5 text-xs"
      >
        {TEMAS.map(({ tema, rotulo, Icone }) => (
          <MenuPrimitive.RadioItem
            key={tema}
            value={tema}
            closeOnClick={false}
            className="inline-flex cursor-default items-center gap-1 rounded-full px-2.5 py-1 text-muted-foreground outline-hidden select-none not-data-checked:hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-checked:bg-primary data-checked:text-primary-foreground"
          >
            <Icone className="size-3.5" aria-hidden />
            {rotulo}
          </MenuPrimitive.RadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </div>
  )
}

/** Avatar e nome; o clique abre os dados da conta e o sair (para cima no rodapé, para baixo no topo da gaveta). */
export function MenuUsuario({ usuario, compacto, lado = 'top', comTema }: { usuario: UsuarioMenu; compacto?: boolean; lado?: 'top' | 'bottom'; comTema?: boolean }) {
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
      <DropdownMenuContent side={lado} align="start" className="w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="px-2 py-1.5">
            <span className="block text-sm font-medium text-foreground">{usuario.nome}</span>
            <span className="block truncate text-xs">{usuario.email}</span>
          </DropdownMenuLabel>
        </DropdownMenuGroup>
        {comTema && (
          <>
            <DropdownMenuSeparator />
            <ItemTema />
          </>
        )}
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
