import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { categoriasCaixa, categoriasDespesa } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CategoriasTable } from './components/categorias-table'
import { CategoriasDespesaTable } from './components/categorias-despesa-table'

export default async function CategoriasCaixaPage() {
  const [categorias, categoriasDespesaLista] = await Promise.all([
    db
      .select()
      .from(categoriasCaixa)
      .orderBy(categoriasCaixa.tipo, asc(categoriasCaixa.ordem), asc(categoriasCaixa.nome)),
    db
      .select()
      .from(categoriasDespesa)
      .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome)),
  ])

  return (
    <AdminGuard href="/admin/categorias-caixa">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Categorias</h1>
          <p className="text-slate-500 text-sm">Gerencie as categorias usadas nos lançamentos de caixa e nas despesas</p>
        </div>
        <Tabs defaultValue="caixa">
          <TabsList>
            <TabsTrigger value="caixa">Caixa</TabsTrigger>
            <TabsTrigger value="despesa">Despesa</TabsTrigger>
          </TabsList>
          <TabsContent value="caixa">
            <div className="space-y-4 pt-4">
              <CategoriasTable categorias={categorias} />
            </div>
          </TabsContent>
          <TabsContent value="despesa">
            <div className="space-y-4 pt-4">
              <CategoriasDespesaTable categorias={categoriasDespesaLista} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminGuard>
  )
}
