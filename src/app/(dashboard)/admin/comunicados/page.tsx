import { AdminGuard } from '../components/admin-guard'
import { listarComunicadosAction } from './actions'
import { ComunicadoForm } from './components/comunicado-form'
import { ComunicadosTable } from './components/comunicados-table'
import { ImportarCsv } from './components/importar-csv'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export default async function ComunicadosPage() {
  const lista = await listarComunicadosAction()

  return (
    <AdminGuard href="/admin/comunicados">
      <div className="space-y-6 max-w-3xl">
        <div>
          <h1 className="text-2xl font-bold">Comunicados</h1>
          <p className="text-slate-500 text-sm">Canal oficial de comunicação interna</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo Comunicado</CardTitle>
          </CardHeader>
          <CardContent>
            <ComunicadoForm />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Importar via CSV</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportarCsv />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Histórico de Comunicados</CardTitle>
          </CardHeader>
          <CardContent>
            <ComunicadosTable comunicados={lista} />
          </CardContent>
        </Card>
      </div>
    </AdminGuard>
  )
}
