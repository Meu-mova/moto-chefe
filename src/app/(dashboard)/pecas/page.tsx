import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { pecasCatalogo, usuarios } from '@/lib/db/schema'
import { asc, inArray } from 'drizzle-orm'
import { listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { hojeBrt } from '@/lib/data-venda'
import { calcStatusMultiPagamento } from '@/lib/conciliacao-status'
import { listarVendasPecasAction } from './actions'
import { podeGerirPecas, podeVenderPeca } from './papeis'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { PecaForm } from './components/peca-form'
import { VendaPecaDialog } from './components/venda-peca-dialog'
import { VendasPecasTable } from './components/vendas-pecas-table'
import { VendasPecasFiltros } from './components/vendas-pecas-filtros'
import { PedidosFabricaTab } from './components/pedidos-fabrica-tab'
import { CatalogoTable } from './components/catalogo-table'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Primeiro dia do mês corrente no calendário de Brasília. */
function primeiroDiaDoMes() {
  return `${hojeBrt().slice(0, 7)}-01`
}

export default async function PecasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; loja?: string; vendedor?: string; forma?: string; de?: string; ate?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/pecas')) redirect('/dashboard')
  const isGestor = podeGerirPecas(usuario.papel)
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const podeVender = podeVenderPeca(usuario.papel)

  const params = await searchParams
  // Período sempre preenchido: os cards somam a lista devolvida, e sem recorte a
  // consulta bateria no teto de 500 linhas e mostraria total menor que o real.
  const de  = params.de  ?? primeiroDiaDoMes()
  const ate = params.ate ?? hojeBrt()

  const [pecas, lojasOpts, lojaIdsGrupo, vendas] = await Promise.all([
    db.select().from(pecasCatalogo).orderBy(asc(pecasCatalogo.nome)),
    listarLojasDoGrupoAtivo(usuario),
    listarLojaIdsDoGrupoAtivo(usuario),
    podeVender
      ? listarVendasPecasAction({
          de, ate,
          lojaId: params.loja,
          vendedorId: params.vendedor,
          forma: params.forma,
          q: params.q,
        })
      : Promise.resolve([]),
  ])

  const vendedoresOpts = podeVender && lojaIdsGrupo.length > 0
    ? await db
        .select({ id: usuarios.id, nome: usuarios.nome })
        .from(usuarios)
        .where(inArray(usuarios.lojaId, lojaIdsGrupo))
        .orderBy(asc(usuarios.nome))
    : []

  // Cards do recorte. Bonificada é a venda que fechou em R$ 0,00 — conta como
  // atendimento e saída de estoque, mas não entra no ticket médio, senão puxaria
  // a média para baixo sem que nenhum desconto real tenha acontecido.
  const faturamento = vendas.reduce((s, v) => s + parseFloat(v.valorTotal), 0)
  const bonificadas = vendas.filter(v => parseFloat(v.valorTotal) < 0.01).length
  const cobradas = vendas.length - bonificadas
  const ticketMedio = cobradas > 0 ? faturamento / cobradas : 0
  const aConciliar = vendas.filter(v => {
    const status = calcStatusMultiPagamento(v.pagamentos, v.conciliadoValor, v.pixConciliadoValor, v.valorTotal)
    return status === 'pendente' || status === 'parcial'
  }).length

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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500">Vendas</CardTitle></CardHeader>
                <CardContent><p className="text-xl font-bold">{vendas.length}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500">Faturamento</CardTitle></CardHeader>
                <CardContent><p className="text-xl font-bold text-emerald-700">{fmt(faturamento)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500">Ticket médio</CardTitle></CardHeader>
                <CardContent><p className="text-xl font-bold">{fmt(ticketMedio)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500">Bonificadas</CardTitle></CardHeader>
                <CardContent><p className="text-xl font-bold text-amber-700">{bonificadas}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-1"><CardTitle className="text-xs text-slate-500">A conciliar</CardTitle></CardHeader>
                <CardContent>
                  <p className={`text-xl font-bold ${aConciliar > 0 ? 'text-blue-700' : 'text-slate-400'}`}>{aConciliar}</p>
                </CardContent>
              </Card>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <VendasPecasFiltros
                lojas={isAdmin ? lojasOpts : []}
                vendedores={vendedoresOpts}
                de={de}
                ate={ate}
              />
              <VendaPecaDialog
                pecas={pecas.filter(p => p.ativo)}
                lojas={lojasOpts}
                lojaUsuarioId={usuario.lojaId}
                isAdmin={isAdmin}
                podeDefinirPreco={isGestor}
              />
            </div>

            <VendasPecasTable vendas={vendas} papel={usuario.papel} pecas={pecas.filter(p => p.ativo)} />
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
