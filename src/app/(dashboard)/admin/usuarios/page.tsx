import { SuperAdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { gestorDaSessao } from '@/lib/gestor-da-sessao'
import { ehGestorDeUsuarios, limitesDaTela } from '@/lib/gestao-usuarios'
import { redirect } from 'next/navigation'
import { listarUsuariosGerenciaveis, lojasDosGruposVisiveis } from '@/lib/usuarios-gerenciaveis'
import { UsuariosTable } from './components/usuarios-table'
import { db } from '@/lib/db'
import { listarCargos } from '@/lib/cargos'
import { contaDoGrupoAtivo } from '@/lib/grupo'
import { modulosQuePodeDar } from '@/lib/navegacao'

export default async function UsuariosPage() {
  const usuario = await getUsuarioLogado()
  // Item liberado por tela a quem não é sócio nem admin_geral não abre: as actions recusariam tudo.
  if (!ehGestorDeUsuarios(usuario)) redirect('/dashboard')
  const gestor = await gestorDaSessao()
  const ehGeral = gestor.papel === 'admin_geral'

  const [todos, lojasOpts, gruposAtivos, contaAtiva] = await Promise.all([
    listarUsuariosGerenciaveis(gestor),
    // admin_geral segue com as lojas do grupo ativo; o sócio escolhe entre todos os grupos que vê.
    ehGeral ? listarLojasDoGrupoAtivo(usuario) : lojasDosGruposVisiveis(gestor.gruposVisiveis),
    // Todos os grupos, não só o ativo: a liberação é justamente para o sócio
    // aprovar num grupo diferente do que ele está olhando. Para o sócio, só os que ele vê.
    listarGruposAtivos(),
    contaDoGrupoAtivo(usuario),
  ])
  // admin_geral recebe os de todas as Contas: o select mostra os da Conta do usuário editado.
  const cargos = await listarCargos(db, { papel: gestor.papel, contaId: contaAtiva })
  const gruposOpts = ehGeral ? gruposAtivos : gruposAtivos.filter(g => gestor.gruposVisiveis.includes(g.id))

  return (
    <SuperAdminGuard href="/admin/usuarios">
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground text-sm">Gerencie os acessos ao sistema</p>
        </div>
        <UsuariosTable
          usuarios={todos}
          lojas={lojasOpts}
          grupos={gruposOpts.map(g => ({ id: g.id, nome: g.nome }))}
          limites={limitesDaTela(gestor)}
          cargos={cargos.map(c => ({ id: c.id, nome: c.nome, modulos: c.modulos, contaId: c.contaId }))}
          contaAtiva={contaAtiva}
          podeDarAoCargo={modulosQuePodeDar(usuario, {})}
        />
      </div>
    </SuperAdminGuard>
  )
}
