import { getUsuarioLogado } from '@/lib/auth'
import { grupoIdDaPropriaLoja, listarGruposVisiveis } from '@/lib/grupo'
import { itensVisiveis } from '@/lib/navegacao'
import { ehGestorDeUsuarios, podeGerenciarCargos, type Gestor } from '@/lib/gestao-usuarios'

// Quem está logado, visto como gestor de usuários (#322): grupos que vê e telas que tem.
// A página de /admin/usuarios e as actions usam o mesmo, para a tela não oferecer o que
// a action recusaria.
export async function gestorDaSessao(): Promise<Gestor> {
  const u = await getUsuarioLogado()
  if (!ehGestorDeUsuarios(u)) throw new Error('Sem permissão para gerenciar usuários')
  const geral = u.papel === 'admin_geral'
  const gruposVisiveis = geral ? [] : (await listarGruposVisiveis(u)).map(g => g.id)
  // O grupo da própria loja ele já aprova por padrão; os demais vêm de grupos_aprovacao.
  const grupoDaLoja = geral ? null : await grupoIdDaPropriaLoja(u.lojaId)
  const gruposAprovacao = [...(grupoDaLoja ? [grupoDaLoja] : []), ...(u.gruposAprovacao ?? [])]
  // Sem as regras próprias: tela que depende delas não se libera pelo sócio.
  // O que só o admin_geral liga (Gerenciar cargos) não se repassa, nem por quem o tem.
  const itensLiberaveis = itensVisiveis(u, {}).filter(i => !i.soAdminGeralLibera).map(i => i.id)
  return {
    id: u.id, papel: u.papel, gruposVisiveis, gruposAprovacao, itensLiberaveis,
    aprovaPagamentoSensivel: u.aprovaPagamentoSensivel === true, podeCargos: podeGerenciarCargos(u),
  }
}
