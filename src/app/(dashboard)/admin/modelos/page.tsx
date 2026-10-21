import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { contas, contaMarcas, modelos, modeloBlingCodigos, modeloApelidos } from '@/lib/db/schema'
import { asc, eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { BlingCodigoCell } from './components/bling-codigo-cell'
import { ModeloFormButton } from './components/modelo-form-button'
import { ApelidosCell } from './components/apelidos-cell'
import { MarcasDaConta } from './components/marcas-da-conta'

export default async function ModelosPage() {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  const [todos, codigos, apelidos, listaContas, escolhas] = await Promise.all([
    db.select().from(modelos).orderBy(modelos.marca),
    db.select({ modeloId: modeloBlingCodigos.modeloId, codigo: modeloBlingCodigos.codigo })
      .from(modeloBlingCodigos)
      .where(eq(modeloBlingCodigos.grupoId, grupo.id)),
    // Apelidos nao sao por grupo: e como a NOTA escreve o produto, e a mesma
    // LAIOUNS vende para os dois CNPJs.
    db.select({ modeloId: modeloApelidos.modeloId, apelido: modeloApelidos.apelido })
      .from(modeloApelidos)
      .orderBy(modeloApelidos.apelido),
    db.select({ id: contas.id, nome: contas.nome }).from(contas).orderBy(asc(contas.nome)),
    db.select().from(contaMarcas),
  ])
  const marcas = [...new Set(todos.map(m => m.marca))].sort()
  const contasComMarcas = listaContas.map(c => ({
    ...c, marcas: escolhas.filter(e => e.contaId === c.id).map(e => e.marca),
  }))
  const codigoPorModelo = new Map(codigos.map(c => [c.modeloId, c.codigo]))
  const apelidosPorModelo = new Map<string, string[]>()
  for (const a of apelidos) {
    apelidosPorModelo.set(a.modeloId, [...(apelidosPorModelo.get(a.modeloId) ?? []), a.apelido])
  }

  return (
    <AdminGuard href="/admin/modelos">
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Modelos</h1>
            <p className="text-slate-500 text-sm">
              Clique em <strong>Cód. Bling</strong> (do grupo <strong>{grupo.nome}</strong>) ou em{' '}
              <strong>Apelidos na NF</strong> para editar inline. Apelido é como a nota de entrada
              escreve o modelo — “DRIFT” para DRIFT CAR — e é o que liga a moto à ficha fiscal.
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
                <TableHead>Apelidos na NF</TableHead>
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
                    <ApelidosCell modeloId={m.id} valores={apelidosPorModelo.get(m.id) ?? []} />
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
        <MarcasDaConta contas={contasComMarcas} marcas={marcas} />
      </div>
    </AdminGuard>
  )
}
