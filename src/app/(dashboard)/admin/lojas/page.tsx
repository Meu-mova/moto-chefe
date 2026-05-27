import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DesativarLojaButton } from './components/desativar-loja-button'

export default async function LojasPage() {
  const todas = await db.select().from(lojas).orderBy(lojas.nome)

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Lojas</h1>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {todas.map(loja => (
                <TableRow key={loja.id}>
                  <TableCell className="font-medium">{loja.nome}</TableCell>
                  <TableCell>{loja.cidade}</TableCell>
                  <TableCell>{loja.endereco}</TableCell>
                  <TableCell>
                    <Badge variant={loja.ativa ? 'default' : 'secondary'}>
                      {loja.ativa ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {loja.ativa && <DesativarLojaButton lojaId={loja.id} />}
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
