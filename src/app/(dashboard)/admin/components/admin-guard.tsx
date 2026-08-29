import { getUsuarioLogado } from '@/lib/auth'
import { redirect } from 'next/navigation'

const PAPEIS_ADMIN = ['admin_geral', 'admin_socio']

// Mantidos como componente para não tocar em 12 arquivos de /admin/*, mas o
// destino do redirect agora é o mesmo das demais guardas (/dashboard). A
// checagem por papel continua aqui porque o guard embrulha páginas diferentes
// e não sabe qual item da tabela de navegação está protegendo.
export async function AdminGuard({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_ADMIN.includes(usuario.papel)) redirect('/dashboard')
  return <>{children}</>
}

export async function SuperAdminGuard({ children }: { children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (usuario.papel !== 'admin_geral') redirect('/dashboard')
  return <>{children}</>
}
