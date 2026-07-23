import { SuperAdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { usuarios, lojas } from '@/lib/db/schema'
import { eq, asc } from 'drizzle-orm'
import { UsuariosTable } from './components/usuarios-table'

export default async function UsuariosPage() {
  const usuario = await getUsuarioLogado()

  const [todos, lojasOpts] = await Promise.all([
    db
      .select({
        id:       usuarios.id,
        nome:     usuarios.nome,
        email:    usuarios.email,
        papel:    usuarios.papel,
        lojaId:   usuarios.lojaId,
        lojaNome: lojas.nome,
        conecta:  usuarios.conecta,
      })
      .from(usuarios)
      .leftJoin(lojas, eq(usuarios.lojaId, lojas.id))
      .orderBy(asc(usuarios.nome)),
    listarLojasDoGrupoAtivo(usuario),
  ])

  return (
    <SuperAdminGuard>
      <div className="space-y-2">
        <div>
          <h1 className="text-2xl font-bold">Usuários</h1>
          <p className="text-slate-500 text-sm">Gerencie os acessos ao sistema</p>
        </div>
        <UsuariosTable usuarios={todos} lojas={lojasOpts} />
      </div>
    </SuperAdminGuard>
  )
}
