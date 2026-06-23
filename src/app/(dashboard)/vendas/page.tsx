import { getUsuarioLogado } from '@/lib/auth'
import { listarPedidosPorLoja, listarTodosPedidos, listarVendas } from '@/lib/queries/vendas'
import { db } from '@/lib/db'
import { motos, modelos, lojas, usuarios } from '@/lib/db/schema'
import { eq, asc, inArray } from 'drizzle-orm'
import { PedidoCard } from './components/pedido-card'
import { CriarPedidoDialog } from './components/criar-pedido-dialog'
import { VendasFiltros } from './components/vendas-filtros'
import { VendasTable } from './components/vendas-table'

const ADMINS = ['admin_geral', 'admin_socio']

function parseParam(v?: string): string[] {
  if (!v) return []
  return v.split(',').filter(Boolean)
}

const PAPEIS_VENDE = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor']

export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ loja?: string; modelo?: string; vendedor?: string; q?: string; nf?: string }>
}) {
  const params  = await searchParams
  const usuario = await getUsuarioLogado()
  const isAdmin = ADMINS.includes(usuario.papel)

  const lojaValues     = params.loja !== undefined
    ? parseParam(params.loja)
    : (!isAdmin && usuario.lojaId ? [usuario.lojaId] : [])
  const vendedorValues = parseParam(params.vendedor)

  const [pedidos, vendasList, motosDisponiveis, lojasOpts, modelosOpts, vendedoresOpts] = await Promise.all([
    isAdmin ? listarTodosPedidos() : listarPedidosPorLoja(usuario.lojaId!),
    listarVendas({
      lojaId:      lojaValues,
      modeloId:    parseParam(params.modelo),
      vendedorId:  vendedorValues,
      chassiBusca: params.q,
      notaFiscal:  params.nf,
    }),
    db
      .select({
        id:       motos.id,
        chassi:   motos.chassi,
        cor:      motos.cor,
        marca:    modelos.marca,
        modelo:   modelos.modelo,
        lojaNome: lojas.nome,
        lojaId:   motos.lojaId,
      })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .innerJoin(lojas,   eq(motos.lojaId,   lojas.id))
      .where(eq(motos.disponibilidade, 'disponivel')),
    db.select({ id: lojas.id,   nome: lojas.nome    }).from(lojas).orderBy(asc(lojas.nome)),
    db.select({ id: modelos.id, modelo: modelos.modelo }).from(modelos).orderBy(asc(modelos.modelo)),
    db.select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(inArray(usuarios.papel, PAPEIS_VENDE as any[]))
      .orderBy(asc(usuarios.nome)),
  ])

  const pendentes = pedidos.filter(p => p.status === 'pendente')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-slate-500 text-sm">Pedidos e histórico de vendas</p>
        </div>
        <CriarPedidoDialog motos={motosDisponiveis} papel={usuario.papel} />
      </div>

      {pendentes.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">
            Pedidos Pendentes ({pendentes.length})
          </h2>
          {pendentes.map(p => (
            <PedidoCard
              key={p.id}
              pedido={p}
              papel={usuario.papel}
              usuarioId={usuario.id}
              lojaIdUsuario={usuario.lojaId ?? null}
            />
          ))}
        </section>
      )}

      <section className="space-y-4">
        <h2 className="font-semibold text-sm text-slate-700">
          Vendas Realizadas ({vendasList.length})
        </h2>
        <VendasFiltros
          lojas={isAdmin || usuario.papel === 'aux_adm' ? lojasOpts : []}
          modelos={modelosOpts}
          vendedores={vendedoresOpts}
          lojaIdDefault={!isAdmin ? (usuario.lojaId ?? null) : null}
          chassiInicial={params.q ?? ''}
          nfInicial={params.nf ?? ''}
        />
        <div className="bg-white rounded-lg border overflow-x-auto">
          <VendasTable vendas={vendasList} papel={usuario.papel} lojaIdUsuario={usuario.lojaId} vendedores={vendedoresOpts} />
        </div>
      </section>
    </div>
  )
}
