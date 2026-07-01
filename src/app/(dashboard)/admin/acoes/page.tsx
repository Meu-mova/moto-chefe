import { SuperAdminGuard as AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { motos, modelos } from '@/lib/db/schema'
import { eq, and, inArray } from 'drizzle-orm'
import { ReatribuirLojaForm } from './components/reatribuir-loja-form'

export default async function AcoesAdminPage() {
  const usuario = await getUsuarioLogado()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const [motosFaturadas, todasLojas] = await Promise.all([
    db
      .select({ id: motos.id, chassi: motos.chassi, lojaId: motos.lojaId, marca: modelos.marca, modelo: modelos.modelo })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(and(eq(motos.status, 'faturada'), inArray(motos.lojaId, lojaIdsGrupo))),
    listarLojasDoGrupoAtivo(usuario),
  ])

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Ações Administrativas</h1>
        <ReatribuirLojaForm motos={motosFaturadas} lojas={todasLojas} />
      </div>
    </AdminGuard>
  )
}
