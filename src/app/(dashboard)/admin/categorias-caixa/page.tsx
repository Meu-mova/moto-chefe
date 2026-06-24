import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { categoriasCaixa } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { CategoriasTable } from './components/categorias-table'

export default async function CategoriasCaixaPage() {
  const categorias = await db
    .select()
    .from(categoriasCaixa)
    .orderBy(categoriasCaixa.tipo, asc(categoriasCaixa.ordem), asc(categoriasCaixa.nome))

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Categorias de Caixa</h1>
          <p className="text-slate-500 text-sm">Gerencie as categorias usadas nos lançamentos de entrada e saída</p>
        </div>
        <CategoriasTable categorias={categorias} />
      </div>
    </AdminGuard>
  )
}
