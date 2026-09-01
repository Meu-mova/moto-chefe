import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { categoriasCaixa, categoriasDespesa } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { CategoriasTable } from './components/categorias-table'
import { CategoriasDespesaTable } from './components/categorias-despesa-table'
import { BeneficiariosTable } from './components/beneficiarios-table'
import { listarBeneficiariosAction } from '@/app/(dashboard)/despesas/actions'

export default async function CategoriasCaixaPage() {
  const [categorias, categoriasDespesaLista, beneficiarios] = await Promise.all([
    db
      .select()
      .from(categoriasCaixa)
      .orderBy(categoriasCaixa.tipo, asc(categoriasCaixa.ordem), asc(categoriasCaixa.nome)),
    db
      .select()
      .from(categoriasDespesa)
      .orderBy(asc(categoriasDespesa.ordem), asc(categoriasDespesa.nome)),
    // A action já resolve o grupo ativo e checa o papel — o AdminGuard cobre a
    // rota, mas quem lista é ela.
    listarBeneficiariosAction(),
  ])

  return (
    <AdminGuard href="/admin/categorias-caixa">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Categorias</h1>
          <p className="text-slate-500 text-sm">
            Gerencie as categorias usadas nos lançamentos de caixa e nas despesas, e a quem se destinam as retiradas
          </p>
        </div>
        <Tabs defaultValue="caixa">
          <TabsList>
            <TabsTrigger value="caixa">Caixa</TabsTrigger>
            <TabsTrigger value="despesa">Despesa</TabsTrigger>
            <TabsTrigger value="beneficiarios">Beneficiários</TabsTrigger>
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
          <TabsContent value="beneficiarios">
            <div className="space-y-4 pt-4">
              <BeneficiariosTable beneficiarios={beneficiarios} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminGuard>
  )
}
