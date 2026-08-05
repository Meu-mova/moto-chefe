import { AdminGuard } from '../components/admin-guard'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarGruposAtivos } from '@/lib/grupo'
import { db } from '@/lib/db'
import { lojas, grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { DesativarLojaButton } from './components/desativar-loja-button'
import { NovaLojaDialog } from './components/nova-loja-dialog'
import { EditarLojaDialog } from './components/editar-loja-dialog'

export default async function LojasPage() {
  const usuario = await getUsuarioLogado()
  const isSuperAdmin = usuario.papel === 'admin_geral'

  const [todas, gruposOpts, grupoAtivo] = await Promise.all([
    db
      .select({
        id: lojas.id, nome: lojas.nome, cidade: lojas.cidade, endereco: lojas.endereco,
        ativa: lojas.ativa, grupoNome: grupos.nome, cep: lojas.cep,
        fabricaEmail: lojas.fabricaEmail, fabricaSenha: lojas.fabricaSenha,
      })
      .from(lojas)
      .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
      .orderBy(lojas.nome),
    isSuperAdmin ? listarGruposAtivos() : Promise.resolve([]),
    getGrupoAtivo(usuario),
  ])

  return (
    <AdminGuard>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Lojas</h1>
            {!isSuperAdmin && (
              <p className="text-sm text-slate-400 mt-1">Visualização — alterações restritas ao Admin Geral</p>
            )}
          </div>
          {isSuperAdmin && <NovaLojaDialog grupos={gruposOpts} grupoIdDefault={grupoAtivo.id} />}
        </div>
        <div className="bg-white rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>Grupo</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Endereço</TableHead>
                <TableHead>Status</TableHead>
                {isSuperAdmin && <TableHead />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {todas.map(loja => (
                <TableRow key={loja.id}>
                  <TableCell className="font-medium">{loja.nome}</TableCell>
                  <TableCell><Badge variant="outline">{loja.grupoNome}</Badge></TableCell>
                  <TableCell>{loja.cidade}</TableCell>
                  <TableCell>{loja.endereco}</TableCell>
                  <TableCell>
                    <Badge variant={loja.ativa ? 'default' : 'secondary'}>
                      {loja.ativa ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  {isSuperAdmin && (
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <EditarLojaDialog loja={{ id: loja.id, nome: loja.nome, cidade: loja.cidade, endereco: loja.endereco, cep: loja.cep, fabricaEmail: loja.fabricaEmail, fabricaSenha: loja.fabricaSenha }} />
                        {loja.ativa && <DesativarLojaButton lojaId={loja.id} />}
                      </div>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </AdminGuard>
  )
}
