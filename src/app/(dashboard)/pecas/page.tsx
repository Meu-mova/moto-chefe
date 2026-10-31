import { getUsuarioLogado } from '@/lib/auth'
import { acessaModulo } from '@/lib/navegacao'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { listarPecas } from '@/lib/pecas-da-conta'
import { contaDoGrupoAtivo, getGrupoAtivo, listarLojasDoGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { listarUsuariosDoGrupo } from '@/lib/usuarios-do-grupo'
import { hojeBrt } from '@/lib/data-venda'
import { calcStatusMultiPagamento } from '@/lib/conciliacao-status'
import { listarVendasPecasAction } from './actions'
import { lojaDoEstoque, PAPEIS_VENDA_PECA, podeGerirPecas, podeVenderPeca } from './papeis'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { buttonVariants } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { Kpi } from '@/components/kpi'
import { PecaForm } from './components/peca-form'
import { VendaPecaDialog } from './components/venda-peca-dialog'
import { VendasPecasTable } from './components/vendas-pecas-table'
import { VendasPecasFiltros } from './components/vendas-pecas-filtros'
import { PedidosFabricaTab } from './components/pedidos-fabrica-tab'
import { CatalogoTable } from './components/catalogo-table'
import { LojaEstoqueSelect } from './components/loja-estoque-select'
import { ImportarPlanilhaPecasDialog } from './components/importar-planilha-pecas-dialog'

const fmt = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** Primeiro dia do mês corrente no calendário de Brasília. */
function primeiroDiaDoMes() {
  return `${hojeBrt().slice(0, 7)}-01`
}

export default async function PecasPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; loja?: string; vendedor?: string; forma?: string; de?: string; ate?: string; estoque?: string }>
}) {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/pecas')) redirect('/dashboard')
  const isGestor = podeGerirPecas(usuario.papel)
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const podeVender = podeVenderPeca(usuario.papel)
  // Mesma regra da Entrada: o servidor das actions também confere.
  const podeImportar = acessaModulo(usuario, 'entrada')

  const params = await searchParams
  // Período sempre preenchido: os cards somam a lista devolvida, e sem recorte a
  // consulta bateria no teto de 500 linhas e mostraria total menor que o real.
  const de  = params.de  ?? primeiroDiaDoMes()
  const ate = params.ate ?? hojeBrt()

  // Estoque por loja (#195): o catálogo mostra o saldo de uma loja só. Admin escolhe
  // entre as do grupo ativo (?estoque=); os outros veem a própria.
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const lojaEstoqueId = lojaDoEstoque(usuario, lojaIdsGrupo, params.estoque)

  const [pecas, lojasOpts, vendas] = await Promise.all([
    contaDoGrupoAtivo(usuario).then(contaId => listarPecas(db, { papel: usuario.papel, contaId }, { lojaId: lojaEstoqueId })),
    listarLojasDoGrupoAtivo(usuario),
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

  const lojaEstoque = lojaEstoqueId
    ? { id: lojaEstoqueId, nome: lojasOpts.find(l => l.id === lojaEstoqueId)?.nome ?? 'sua loja' }
    : null

  const vendedoresOpts = podeVender && lojaIdsGrupo.length > 0
    ? await listarUsuariosDoGrupo((await getGrupoAtivo(usuario)).id, { papeis: PAPEIS_VENDA_PECA })
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
        <p className="text-sm text-muted-foreground">Catálogo, estoque e vendas de peças e capacetes</p>
      </div>

      <Tabs defaultValue={podeVender ? 'vendas' : 'catalogo'}>
        <TabsList className="max-w-full overflow-x-auto overflow-y-hidden lg:overflow-visible">
          {/* Mecânico só consulta o catálogo — vender peça não é papel dele. */}
          {podeVender && <TabsTrigger value="vendas">Vendas</TabsTrigger>}
          <TabsTrigger value="catalogo">Catálogo</TabsTrigger>
          {/* Só gestor: a leitura usa o login da loja no portal da fábrica. */}
          {isGestor && <TabsTrigger value="pedidos-fabrica">Pedidos na fábrica</TabsTrigger>}
        </TabsList>

        {podeVender && (
          <TabsContent value="vendas" className="mt-4 space-y-4">
            {/* Celular: faixa que rola para o lado, sem barra à vista. Desktop: grade (padrão de Vendas). */}
            <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-3 lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
              <Kpi tom="neutro" titulo="Vendas" valor={vendas.length} />
              <Kpi tom="ok" titulo="Faturamento" valor={fmt(faturamento)} />
              <Kpi tom="neutro" titulo="Ticket médio" valor={fmt(ticketMedio)} />
              <Kpi tom={bonificadas > 0 ? 'aviso' : 'neutro'} titulo="Bonificadas" valor={bonificadas} />
              <Kpi tom={aConciliar > 0 ? 'perigo' : 'neutro'} titulo="A conciliar" valor={aConciliar} />
            </div>

            <div className="flex flex-col gap-2 lg:flex-row lg:items-start lg:justify-between">
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
          {(isAdmin || isGestor || podeImportar) && (
            <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-end">
              {isAdmin && <LojaEstoqueSelect lojas={lojasOpts} lojaId={lojaEstoqueId} />}
              {podeImportar && <ImportarPlanilhaPecasDialog lojas={lojasOpts} />}
              {isGestor && <PecaForm lojaEstoque={lojaEstoque} triggerClassName="flex w-full cursor-pointer lg:inline-flex lg:w-auto" trigger={
                <span className={`${buttonVariants({ variant: 'default' })} h-10 w-full gap-1.5 lg:h-9 lg:w-auto`}>
                  <Plus className="size-4" /> Nova peça
                </span>
              } />}
            </div>
          )}

          <CatalogoTable pecas={pecas} isGestor={isGestor} lojaEstoque={lojaEstoque} />

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
