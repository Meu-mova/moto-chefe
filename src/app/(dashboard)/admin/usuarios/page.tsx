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
import { acessosDeFora, gruposLiberaveis, liberacoesPorUsuario } from '@/lib/grupos-liberados-admin'
import { nomesDasContas } from '@/lib/conta'

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
  // Grupos de outras Contas: o admin_geral libera ao admin_rede; a Conta dona só vê quem tem (ADR-0019).
  // Na persona do admin_rede, não: a lista traz os outros grupos da Conta dona.
  const [liberaveis, liberadosPorUsuario, deFora] = await Promise.all([
    ehGeral ? gruposLiberaveis() : null,
    ehGeral ? liberacoesPorUsuario() : {},
    ehGeral || usuario.grupoLiberado ? [] : acessosDeFora(contaAtiva),
  ])
  // Só as Contas dos usuários já recortados para este gestor: nada de outra Conta.
  const contasNomes = Object.fromEntries(await nomesDasContas(todos.map(u => u.contaId).filter((c): c is string => !!c)))
  const gruposOpts = ehGeral ? gruposAtivos : gruposAtivos.filter(g => gestor.gruposVisiveis.includes(g.id))

  return (
    <SuperAdminGuard href="/admin/usuarios">
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-muted-foreground text-sm">Quem acessa o MOVA e o que cada um pode fazer.</p>
        </div>
        <UsuariosTable
          usuarios={todos}
          lojas={lojasOpts}
          grupos={gruposOpts.map(g => ({ id: g.id, nome: g.nome, contaId: g.contaId }))}
          limites={limitesDaTela(gestor)}
          cargos={cargos.map(c => ({ id: c.id, nome: c.nome, modulos: c.modulos, contaId: c.contaId }))}
          contaAtiva={contaAtiva}
          podeDarAoCargo={modulosQuePodeDar(usuario, {})}
          liberaveis={liberaveis}
          liberadosPorUsuario={liberadosPorUsuario}
          contasNomes={contasNomes}
        />
        {deFora.length > 0 && (
          <section className="space-y-2 pt-4">
            <div>
              <h2 className="text-lg font-semibold">Acesso de fora</h2>
              <p className="text-muted-foreground text-sm">
                Pessoas de outras Contas com acesso a grupos desta Conta, liberadas pelo Admin Geral do MOVA.
              </p>
            </div>
            <ul className="bg-card divide-y rounded-lg border text-sm">
              {deFora.map((a, i) => (
                <li key={i} className="flex flex-wrap justify-between gap-2 px-4 py-2">
                  <span><strong>{a.usuarioNome}</strong> ({a.contaOrigem ?? 'sem Conta'}) em {a.grupoNome}</span>
                  <span className="text-muted-foreground">desde {a.liberadoEm.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </SuperAdminGuard>
  )
}
