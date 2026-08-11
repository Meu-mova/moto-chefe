import { SuperAdminGuard } from '../components/admin-guard'
import { listarGruposAction } from './actions'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NovoGrupoButton, EditarGrupoButton } from './components/grupo-dialog'

export default async function GruposPage() {
  const lista = await listarGruposAction()

  return (
    <SuperAdminGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Grupos</h1>
            <p className="text-slate-500 text-sm">Empresas (CNPJs) operadas no sistema</p>
          </div>
          <NovoGrupoButton />
        </div>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Contrato</TableHead>
                <TableHead>Status</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {lista.map(g => (
                <TableRow key={g.id}>
                  <TableCell className="font-medium">{g.nome}</TableCell>
                  <TableCell>{g.cnpj}</TableCell>
                  <TableCell>
                    {g.razaoSocial && g.enderecoSede && g.cidadeSede && g.comarcaForo
                      ? <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100">Configurado</Badge>
                      : <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100" title="Falta razão social, endereço da sede, cidade da sede ou comarca — o envio de contrato fica bloqueado neste grupo">Pendente</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.ativo ? 'default' : 'secondary'}>{g.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </TableCell>
                  <TableCell><EditarGrupoButton grupo={g} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
