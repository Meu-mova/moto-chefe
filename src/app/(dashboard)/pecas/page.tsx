import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { pecasCatalogo } from '@/lib/db/schema'
import { asc } from 'drizzle-orm'
import { listarLojasDoGrupoAtivo } from '@/lib/grupo'
import { listarVendasPecasAction } from './actions'
import { podeGerirPecas, podeVenderPeca } from './papeis'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { buttonVariants } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { PecaForm } from './components/peca-form'
import { VendaPecaDialog } from './components/venda-peca-dialog'
import { VendasPecasTable } from './components/vendas-pecas-table'
import { PedidosFabricaTab } from './components/pedidos-fabrica-tab'
import { CatalogoTable } from './components/catalogo-table'


export default async function PecasPage() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/pecas')) redirect('/dashboard')
  const isGestor = podeGerirPecas(usuario.papel)
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const podeVender = podeVenderPeca(usuario.papel)

  const [pecas, lojasOpts, vendas] = await Promise.all([
    db.select().from(pecasCatalogo).orderBy(asc(pecasCatalogo.nome)),
    listarLojasDoGrupoAtivo(usuario),
    podeVender ? listarVendasPecasAction() : Promise.resolve([]),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Peças e Acessórios</h1>
        <p className="text-slate-500 text-sm">Catálogo, estoque e vendas de peças e capacetes</p>
      </div>

      <Tabs defaultValue={podeVender ? 'vendas' : 'catalogo'}>
        <TabsList>
          {/* Mecânico só consulta o catálogo — vender peça não é papel dele. */}
          {podeVender && <TabsTrigger value="vendas">Vendas</TabsTrigger>}
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          {/* Só gestor: a leitura usa o login da loja no portal da fábrica. */}
          {isGestor && <TabsTrigger value="pedidos-fabrica">Pedidos na fábrica</TabsTrigger>}
        </TabsList>

        {podeVender && (
          <TabsContent value="vendas" className="mt-4 space-y-4">
            <div className="flex justify-end">
              <VendaPecaDialog
                pecas={pecas.filter(p => p.ativo)}
                lojas={lojasOpts}
                lojaUsuarioId={usuario.lojaId}
                isAdmin={isAdmin}
                podeDefinirPreco={isGestor}
              />
            </div>
            <VendasPecasTable vendas={vendas} papel={usuario.papel} />
          </TabsContent>
        )}

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

          <CatalogoTable pecas={pecas} isGestor={isGestor} />

        </TabsContent>

        {isGestor && (
          <TabsContent value="pedidos-fabrica" className="mt-4">
            <PedidosFabricaTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}
