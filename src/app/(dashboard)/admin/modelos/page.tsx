import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { modelos, modeloBlingCodigos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BlingCodigoCell } from './components/bling-codigo-cell'
import { ModeloFormButton } from './components/modelo-form-button'

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

  // O NCM é o que marca a ficha fiscal como existente — sem ele não se emite
  // nota própria. Ver cadastrarFichaFiscalFaltante na action da Entrada.
  const comFicha = todos.filter(m => m.ncm).length
  const semFicha = todos.length - comFicha

  return (
    <AdminGuard href="/admin/modelos">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Modelos</h1>
            <p className="text-slate-500 text-sm">
              Clique na coluna <strong>Cód. Bling</strong> para editar inline — código do grupo <strong>{grupo.nome}</strong>
            </p>
            <p className="text-slate-500 text-sm mt-0.5">
              Ficha fiscal: <strong>{comFicha} de {todos.length}</strong> modelo(s) com NCM.
              {semFicha > 0 && (
                <span className="text-amber-600">
                  {' '}{semFicha} ainda sem — ela se preenche sozinha ao importar o XML da próxima compra.
                </span>
              )}
            </p>
          </div>
          <ModeloFormButton />
        </div>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Marca</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Potência</TableHead>
                <TableHead>Cód. Bling</TableHead>
                <TableHead>Ficha fiscal</TableHead>
                <TableHead className="w-10"></TableHead>
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
                  <TableCell>
                    <BlingCodigoCell modeloId={m.id} valor={codigoPorModelo.get(m.id) ?? null} />
                  </TableCell>
                  <TableCell>
                    {m.ncm ? (
                      <span
                        className="font-mono text-xs text-slate-600"
                        title={`NCM ${m.ncm}${m.cest ? ` · CEST ${m.cest}` : ''}${m.origem ? ` · origem ${m.origem}` : ''}${m.cstIcmsEntrada ? ` · CST entrada ${m.cstIcmsEntrada}` : ''}${m.fiscalNota ? ` — da NF ${m.fiscalNota}` : ''}`}
                      >
                        {m.ncm}
                      </span>
                    ) : (
                      <Badge variant="outline" className="text-amber-700 border-amber-300">
                        sem ficha
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <ModeloFormButton modelo={{
                      id: m.id, marca: m.marca, modelo: m.modelo,
                      categoria: m.categoria, potenciaW: m.potenciaW,
                    }} />
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
