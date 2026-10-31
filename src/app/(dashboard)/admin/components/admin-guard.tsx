import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { redirect } from 'next/navigation'

// Mantidos como componente para não tocar em 12 arquivos de /admin/*, mas a
// checagem agora sai da tabela de navegação (modulos_extras/bloqueados
// entram na conta) em vez de checar papel direto — senão liberar um item de
// /admin/* pela tela de usuários não abre a rota, e vira link morto. Cada
// página passa o próprio href porque o guard embrulha páginas diferentes e
// não sabe sozinho qual item da tabela está protegendo.
/**
 * Primeira linha da página, antes de buscar qualquer dado (#579): a busca recusa o papel
 * sem acesso e a página quebraria com "Erro ao carregar" antes do redirect do guard.
 */
export async function exigirAcessoPagina(href: string) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, href)) redirect('/dashboard')
  return usuario
}

export async function AdminGuard({ href, children }: { href: string; children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, href)) redirect('/dashboard')
  return <>{children}</>
}

export async function SuperAdminGuard({ href, children }: { href: string; children: React.ReactNode }) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, href)) redirect('/dashboard')
  return <>{children}</>
}
