import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { modelos } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BlingCodigoCell } from './components/bling-codigo-cell'

export default async function ModelosPage() {
  const todos = await db.select().from(modelos).orderBy(modelos.marca)

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Modelos</h1>
          <p className="text-slate-500 text-sm">Clique na coluna <strong>Cód. Bling</strong> para editar inline</p>
        </div>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Potência</TableHead>
                <TableHead>Motor</TableHead>
                <TableHead>Vel. Máx.</TableHead>
                <TableHead>Cód. Bling</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todos.map(m => (
                <TableRow key={m.id}>
                  <TableCell className="font-medium">{m.marca}</TableCell>
                  <TableCell>{m.modelo}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{m.categoria}</Badge>
                  </TableCell>
                  <TableCell>{m.potenciaW}W</TableCell>
                  <TableCell>{m.motor}</TableCell>
                  <TableCell>{m.velocidadeMax} km/h</TableCell>
                  <TableCell>
                    <BlingCodigoCell modeloId={m.id} valor={m.blingCodigo ?? null} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminGuard>
  )
}
