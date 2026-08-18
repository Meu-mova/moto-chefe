import { SuperAdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios, lojas } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { UsuariosTable } from './components/usuarios-table'

export default async function UsuariosPage() {
  const usuario = await getUsuarioLogado()

  const [todos, lojasOpts, gruposOpts] = await Promise.all([
    db
      .select({
        id:       usuarios.id,
        nome:     usuarios.nome,
        email:    usuarios.email,
        papel:    usuarios.papel,
        lojaId:   usuarios.lojaId,
        lojaNome: lojas.nome,
        conecta:  usuarios.conecta,
        gruposAprovacao:         usuarios.gruposAprovacao,
        aprovaPagamentoSensivel: usuarios.aprovaPagamentoSensivel,
        // Grupo da loja fixa: já aprova nele por padrão, então o formulário
        // mostra esse grupo como fixo em vez de oferecê-lo como opção.
        grupoDaLojaId:           lojas.grupoId,
      })
      .from(usuarios)
      .leftJoin(lojas, eq(usuarios.lojaId, lojas.id))
      .orderBy(asc(usuarios.nome)),
    listarLojasDoGrupoAtivo(usuario),
    // Todos os grupos, não só o ativo: a liberação é justamente para o sócio
    // aprovar num grupo diferente do que ele está olhando.
    listarGruposAtivos(),
  ])

  return (
    <SuperAdminGuard>
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-slate-500 text-sm">Gerencie os acessos ao sistema</p>
        </div>
        <UsuariosTable
          usuarios={todos}
          lojas={lojasOpts}
          grupos={gruposOpts.map(g => ({ id: g.id, nome: g.nome }))}
        />
      </div>
    </SuperAdminGuard>
  )
}
