import { AdminGuard, exigirAcessoPagina } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { calendarioCategorias } from '@/lib/db/schema'
import { and, eq, asc } from 'drizzle-orm'
import { CategoriasCalendarioTable } from './components/categorias-table'

export default async function CalendarioCategoriasPage() {
  await exigirAcessoPagina('/admin/calendario-categorias')
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  const categorias = await db
    .select({ id: calendarioCategorias.id, nome: calendarioCategorias.nome, cor: calendarioCategorias.cor, ativo: calendarioCategorias.ativo, ordem: calendarioCategorias.ordem })
    .from(calendarioCategorias)
    .where(and(eq(calendarioCategorias.grupoId, grupo.id)))
    .orderBy(asc(calendarioCategorias.ordem), asc(calendarioCategorias.nome))

  return (
    <AdminGuard href="/admin/calendario-categorias">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Categorias do calendário</h1>
          <p className="text-muted-foreground text-sm">Categorias e cores usadas nos eventos do calendário · {grupo.nome}</p>
        </div>
        <CategoriasCalendarioTable categorias={categorias} />
      </div>
    </AdminGuard>
  )
}
