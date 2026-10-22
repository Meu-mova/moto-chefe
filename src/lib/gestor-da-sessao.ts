import { getUsuarioLogado } from '@/lib/auth'
import { listarGruposVisiveis } from '@/lib/grupo'
import { itensVisiveis } from '@/lib/navegacao'
import { ehGestorDeUsuarios, type Gestor } from '@/lib/gestao-usuarios'

// Quem está logado, visto como gestor de usuários (#322): grupos que vê e telas que tem.
// A página de /admin/usuarios e as actions usam o mesmo, para a tela não oferecer o que
// a action recusaria.
export async function gestorDaSessao(): Promise<Gestor> {
  const u = await getUsuarioLogado()
  if (!ehGestorDeUsuarios(u)) throw new Error('Sem permissão para gerenciar usuários')
  const gruposVisiveis = u.papel === 'admin_geral' ? [] : (await listarGruposVisiveis(u)).map(g => g.id)
  // Sem as regras próprias: tela que depende delas não se libera pelo sócio.
  const itensLiberaveis = itensVisiveis(u, {}).map(i => i.id)
  return { id: u.id, papel: u.papel, gruposVisiveis, itensLiberaveis, aprovaPagamentoSensivel: u.aprovaPagamentoSensivel === true }
}
