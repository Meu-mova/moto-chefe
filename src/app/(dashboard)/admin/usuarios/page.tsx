import { SuperAdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { gestorDaSessao } from '@/lib/gestor-da-sessao'
import { ehGestorDeUsuarios, limitesDaTela } from '@/lib/gestao-usuarios'
import { redirect } from 'next/navigation'
import { listarUsuariosGerenciaveis } from '@/lib/usuarios-gerenciaveis'
import { UsuariosTable } from './components/usuarios-table'

export default async function UsuariosPage() {
  const usuario = await getUsuarioLogado()
  // Item liberado por tela a quem não é sócio nem admin_geral não abre: as actions recusariam tudo.
  if (!ehGestorDeUsuarios(usuario)) redirect('/dashboard')
  const gestor = await gestorDaSessao()
  const ehGeral = gestor.papel === 'admin_geral'

  const [todos, lojasOpts, gruposAtivos] = await Promise.all([
    listarUsuariosGerenciaveis(gestor),
    listarLojasDoGrupoAtivo(usuario),
    // Todos os grupos, não só o ativo: a liberação é justamente para o sócio
    // aprovar num grupo diferente do que ele está olhando. Para o sócio, só os que ele vê.
    listarGruposAtivos(),
  ])
  const gruposOpts = ehGeral ? gruposAtivos : gruposAtivos.filter(g => gestor.gruposVisiveis.includes(g.id))

  return (
    <SuperAdminGuard href="/admin/usuarios">
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-slate-500 text-sm">Gerencie os acessos ao sistema</p>
        </div>
        <UsuariosTable
          usuarios={todos}
          lojas={lojasOpts}
          grupos={gruposOpts.map(g => ({ id: g.id, nome: g.nome }))}
          limites={limitesDaTela(gestor)}
        />
      </div>
    </SuperAdminGuard>
  )
}
