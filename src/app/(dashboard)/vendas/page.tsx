import { getUsuarioLogado } from '@/lib/auth'
import { listarPedidosPorLoja, listarTodosPedidos } from '@/lib/queries/vendas'
import { db } from '@/lib/db'
import { motos, modelos, lojas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { PedidoCard } from './components/pedido-card'
import { CriarPedidoDialog } from './components/criar-pedido-dialog'

export default async function VendasPage() {
  const usuario = await getUsuarioLogado()

  const [pedidos, motosDisponiveis] = await Promise.all([
    usuario.papel === 'admin_geral'
      ? listarTodosPedidos()
      : listarPedidosPorLoja(usuario.lojaId!),
    db
      .select({
        id: motos.id,
        chassi: motos.chassi,
        cor: motos.cor,
        marca: modelos.marca,
        modelo: modelos.modelo,
        lojaNome: lojas.nome,
        lojaId: motos.lojaId,
      })
      .from(motos)
      .innerJoin(modelos, eq(motos.modeloId, modelos.id))
      .innerJoin(lojas, eq(motos.lojaId, lojas.id))
      .where(eq(motos.status, 'disponivel')),
  ])

  const pendentes = pedidos.filter(p => p.status === 'pendente')
  const historico = pedidos.filter(p => p.status !== 'pendente')

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Vendas</h1>
          <p className="text-slate-500 text-sm">Pedidos e efetivações</p>
        </div>
        <CriarPedidoDialog motos={motosDisponiveis} papel={usuario.papel} />
      </div>

      {pendentes.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Pedidos Pendentes ({pendentes.length})</h2>
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

      {historico.length > 0 && (
        <section className="space-y-3">
          <h2 className="font-semibold text-sm text-slate-700">Histórico</h2>
          {historico.map(p => (
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

      {pedidos.length === 0 && (
        <p className="text-sm text-slate-400 text-center py-12">Nenhum pedido registrado.</p>
      )}
    </div>
  )
}
