import { getUsuarioLogado } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { pecasCatalogo } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { listarVendasPecasAction } from './actions'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { buttonVariants } from '@/components/ui/button'
import { Plus, Pencil } from 'lucide-react'
import { PecaForm } from './components/peca-form'
import { PecaAtivoToggle } from './components/peca-ativo-toggle'
import { VendaPecaDialog } from './components/venda-peca-dialog'
import { VendasPecasTable } from './components/vendas-pecas-table'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm']
const PAPEIS_PECAS = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

export default async function PecasPage() {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_PECAS.includes(usuario.papel)) redirect('/dashboard')
  const isGestor = GESTORES.includes(usuario.papel)
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)

  const [pecas, lojasOpts, vendas] = await Promise.all([
    db.select().from(pecasCatalogo).orderBy(asc(pecasCatalogo.nome)),
    listarLojasDoGrupoAtivo(usuario),
    listarVendasPecasAction(),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Peças e Acessórios</h1>
        <p className="text-slate-500 text-sm">Catálogo, estoque e vendas de peças e capacetes</p>
      </div>

      <Tabs defaultValue="vendas">
        <TabsList>
          <TabsTrigger value="vendas">Vendas</TabsTrigger>
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
        </TabsList>

        <TabsContent value="vendas" className="mt-4 space-y-4">
          <div className="flex justify-end">
            <VendaPecaDialog
              pecas={pecas.filter(p => p.ativo)}
              lojas={lojasOpts}
              lojaUsuarioId={usuario.lojaId}
              isAdmin={isAdmin}
            />
          </div>
          <VendasPecasTable vendas={vendas} papel={usuario.papel} />
        </TabsContent>

        <TabsContent value="catalogo" className="mt-4 space-y-4">
          {isGestor && (
            <div className="flex justify-end">
              <PecaForm trigger={
                <span className={buttonVariants({ variant: 'default', size: 'sm' })}>
                  <Plus size={15} className="mr-1.5" /> Nova Peça
                </span>
              } />
            </div>
          )}

          <div className="bg-white rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Estoque</TableHead>
                  <TableHead>Status</TableHead>
                  {isGestor && <TableHead />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pecas.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">{p.nome}</TableCell>
                    <TableCell>
                      {parseFloat(p.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </TableCell>
                    <TableCell className={p.quantidadeEstoque <= 0 ? 'text-red-600 font-medium' : ''}>
                      {p.quantidadeEstoque}
                    </TableCell>
                    <TableCell>
                      {isGestor ? (
                        <PecaAtivoToggle id={p.id} ativo={p.ativo} />
                      ) : (
                        <span className="text-xs text-slate-500">{p.ativo ? 'Ativo' : 'Inativo'}</span>
                      )}
                    </TableCell>
                    {isGestor && (
                      <TableCell>
                        <PecaForm
                          pecaInicial={{ id: p.id, nome: p.nome, valor: p.valor, quantidadeEstoque: p.quantidadeEstoque }}
                          trigger={
                            <button className="text-slate-400 hover:text-slate-700">
                              <Pencil size={14} />
                            </button>
                          }
                        />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {pecas.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={isGestor ? 5 : 4} className="text-center text-slate-400 py-8">
                      Nenhuma peça cadastrada.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
