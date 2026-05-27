import { AdminGuard } from '../components/admin-guard'
import { db } from '@/lib/db'
import { usuarios, lojas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

const papelLabel: Record<string, string> = {
  admin_geral: 'Admin Geral',
  aux_adm: 'Aux. Adm.',
  vendedor: 'Vendedor',
  mecanico: 'Mecânico',
}

export default async function UsuariosPage() {
  const todos = await db
    .select({
      id: usuarios.id,
      nome: usuarios.nome,
      email: usuarios.email,
      papel: usuarios.papel,
      lojaId: usuarios.lojaId,
      lojaNome: lojas.nome,
    })
    .from(usuarios)
    .leftJoin(lojas, eq(usuarios.lojaId, lojas.id))
    .orderBy(usuarios.nome)

  return (
    <AdminGuard>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Usuários</h1>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Loja</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {todos.map(u => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.nome}</TableCell>
                  <TableCell className="text-slate-500">{u.email}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{papelLabel[u.papel] ?? u.papel}</Badge>
                  </TableCell>
                  <TableCell>{u.lojaNome ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminGuard>
  )
}
