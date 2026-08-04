import Link from 'next/link'
import { logoutAction } from '@/app/(auth)/login/actions'
import { getUsuarioLogado } from '@/lib/auth'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

const papelLabel: Record<string, string> = {
  admin_geral:  'Admin Geral',
  admin_socio:  'Admin Sócio',
  aux_adm:      'Aux. Administrativo',
  vendedor:     'Vendedor',
  mecanico:     'Mecânico',
}

export async function Header() {
  const usuario = await getUsuarioLogado()
  return (
    <header className="h-14 border-b bg-white flex items-center justify-between px-6">
      <div />
      <div className="flex items-center gap-4">
        <div className="text-right">
          <p className="text-sm font-medium">{usuario.nome}</p>
          <Badge variant="secondary" className="text-xs">{papelLabel[usuario.papel]}</Badge>
        </div>
        <Link href="/completar-cadastro" className="text-sm text-slate-500 hover:text-slate-900">
          Meus dados
        </Link>
        <form action={logoutAction}>
          <Button variant="outline" size="sm" type="submit">Sair</Button>
        </form>
      </div>
    </header>
  )
}
