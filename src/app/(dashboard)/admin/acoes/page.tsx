import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { motos, lojas, modelos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { ReatribuirLojaForm } from './components/reatribuir-loja-form'

export default async function AcoesAdminPage() {
  const [motosFaturadas, todasLojas] = await Promise.all([
    db
      .select({ id: motos.id, chassi: motos.chassi, lojaId: motos.lojaId, marca: modelos.marca, modelo: modelos.modelo })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .where(eq(motos.status, 'faturada')),
    db
      .select({ id: lojas.id, nome: lojas.nome })
      .from(lojas)
      .where(eq(lojas.ativa, true)),
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
