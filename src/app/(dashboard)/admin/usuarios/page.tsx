import { SuperAdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { gestorDaSessao } from '@/lib/gestor-da-sessao'
import { ehGestorDeUsuarios, podeExcluir } from '@/lib/gestao-usuarios'
import { redirect } from 'next/navigation'
import { listarUsuariosGerenciaveis } from '@/lib/usuarios-gerenciaveis'
import { UsuariosTable, type Limites } from './components/usuarios-table'

const TODOS_OS_PAPEIS = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor', 'mecanico', 'motorista']

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

  // Os mesmos limites que as actions conferem (@/lib/gestao-usuarios); aqui só para a
  // tela não oferecer o que seria recusado.
  const limites: Limites = {
    podeExcluir: podeExcluir(gestor),
    papeis: ehGeral ? TODOS_OS_PAPEIS : TODOS_OS_PAPEIS.filter(p => p !== 'admin_geral'),
    itensLiberaveis: ehGeral ? null : gestor.itensLiberaveis,
    aprovaPagamentoSensivel: ehGeral || gestor.aprovaPagamentoSensivel,
  }

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
          limites={limites}
        />
      </div>
    </SuperAdminGuard>
  )
}
