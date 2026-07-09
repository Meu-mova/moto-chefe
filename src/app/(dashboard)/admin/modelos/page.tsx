import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { modelos, modeloBlingCodigos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BlingCodigoCell } from './components/bling-codigo-cell'

export default async function ModelosPage() {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  const [todos, codigos] = await Promise.all([
    db.select().from(modelos).orderBy(modelos.marca),
    db.select({ modeloId: modeloBlingCodigos.modeloId, codigo: modeloBlingCodigos.codigo })
      .from(modeloBlingCodigos)
      .where(eq(modeloBlingCodigos.grupoId, grupo.id)),
  ])
  const codigoPorModelo = new Map(codigos.map(c => [c.modeloId, c.codigo]))

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Modelos</h1>
          <p className="text-slate-500 text-sm">
            Clique na coluna <strong>Cód. Bling</strong> para editar inline — código do grupo <strong>{grupo.nome}</strong>
          </p>
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
                    <BlingCodigoCell modeloId={m.id} valor={codigoPorModelo.get(m.id) ?? null} />
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
