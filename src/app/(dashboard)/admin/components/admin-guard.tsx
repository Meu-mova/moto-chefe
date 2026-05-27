import { getUsuarioLogado } from '@/lib/auth'
import { redirect } from 'next/navigation'

export async function AdminGuard({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') redirect('/estoque')
  return <>{children}</>
}
