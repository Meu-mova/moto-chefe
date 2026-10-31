import { SuperAdminGuard } from '../components/admin-guard'
import { listarContasAction, listarGruposAction } from './actions'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { NovoGrupoButton, EditarGrupoButton } from './components/grupo-dialog'
import { MoverGrupoButton } from './components/mover-grupo-dialog'

export default async function GruposPage() {
  const [lista, contas] = await Promise.all([listarGruposAction(), listarContasAction()])

  return (
    <SuperAdminGuard href="/admin/grupos">
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Grupos</h1>
            <p className="text-muted-foreground text-sm">Empresas (CNPJs) operadas no sistema</p>
          </div>
          <NovoGrupoButton contas={contas} />
        </div>
        <div className="bg-card rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>CNPJ</TableHead>
                <TableHead>Conta</TableHead>
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
                  <TableCell className="text-muted-foreground">{g.contaNome}</TableCell>
                  <TableCell>
                    {g.razaoSocial && g.enderecoSede && g.cidadeSede && g.comarcaForo
                      ? <Badge className="bg-success/15 text-success hover:bg-success/15">Configurado</Badge>
                      : <Badge className="bg-warning/15 text-warning hover:bg-warning/15" title="Falta razão social, endereço da sede, cidade da sede ou comarca — o envio de contrato fica bloqueado neste grupo">Pendente</Badge>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={g.ativo ? 'default' : 'secondary'}>{g.ativo ? 'Ativo' : 'Inativo'}</Badge>
                  </TableCell>
                  <TableCell className="whitespace-nowrap"><EditarGrupoButton grupo={g} /><MoverGrupoButton grupo={{ id: g.id, nome: g.nome, contaId: g.contaId }} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </SuperAdminGuard>
  )
}
