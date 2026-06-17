import { getUsuarioLogado } from '@/lib/auth'
import { redirect } from 'next/navigation'

const PAPEIS_ADMIN = ['admin_geral', 'admin_socio']

export async function AdminGuard({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_ADMIN.includes(usuario.papel)) redirect('/estoque')
  return <>{children}</>
}

export async function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') redirect('/admin')
  return <>{children}</>
}
