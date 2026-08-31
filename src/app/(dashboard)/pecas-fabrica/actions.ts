'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { paraCadaLojaNaFabrica, type ResultadoLojaFabrica } from '@/lib/fabrica-por-loja'
import {
  listarPedidosCompraFabrica,
  buscarDetalheCompraFabrica,
  ehRetiradaNaLoja,
  STATUS_PRONTOS_RETIRADA,
  type PedidoCompraFabrica,
} from '@/lib/fabrica-scraper'

const PAPEIS_PERMITIDOS = ['admin_geral', 'admin_socio', 'aux_adm']

export type PecaSeparada = {
  peca: string
  quantidade: number | null
  categoria: string | null
  numeroPedido: string
  /** "29/07/2026 18:17" como vem do portal. */
  dataPedido: string | null
  /** "Separado" ou "Conferido" — as duas pontas do que já dá para retirar. */
  status: string
}

export type LojaPecasSeparadas = ResultadoLojaFabrica<PecaSeparada> & { pecas: PecaSeparada[] }

/**
 * Lê no portal da fábrica, para cada loja do grupo do usuário, os pedidos de
 * compra com status "Separado" ou "Conferido" e devolve as peças que são de
 * RETIRADA (as que se pega no galpão — as de Correios a fábrica manda pelo malote).
 *
 * Uma requisição por status: o filtro do portal é server-side e aceita um só, e
 * sem filtro viriam ~36 páginas de histórico das quais só a primeira é lida.
 *
 * A lista de pedidos não traz o nome da peça nem o tipo de entrega, então abre
 * o detalhe de cada pedido. Leitura ao vivo, sem gravar nada.
 */
export async function listarPecasSeparadasAction(): Promise<LojaPecasSeparadas[]> {
  const u = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(u.papel)) throw new Error('Sem permissão')

  const resultado = await paraCadaLojaNaFabrica<PecaSeparada>(u, async session => {
    const aceitos = new Set(STATUS_PRONTOS_RETIRADA.map(s => s.toLowerCase()))
    const prontos = new Map<string, { pedido: PedidoCompraFabrica; status: string }>()

    for (const status of STATUS_PRONTOS_RETIRADA) {
      for (const p of await listarPedidosCompraFabrica(session, status)) {
        // O portal filtra por texto e já vem certo, mas uma mudança de rótulo lá
        // devolveria a lista inteira — conferimos o status exato de cada linha.
        const lido = (p.status ?? '').trim()
        if (!aceitos.has(lido.toLowerCase())) continue
        // Mesmo pedido não volta nas duas listas, mas dedup evita peça repetida
        // na tela se o portal um dia deixar de ser exclusivo entre os status.
        if (!prontos.has(p.numeroPedido)) prontos.set(p.numeroPedido, { pedido: p, status: lido })
      }
    }

    const pecas: PecaSeparada[] = []
    for (const { pedido: p, status } of prontos.values()) {
      const det = await buscarDetalheCompraFabrica(session, p.numeroPedido)
      if (!ehRetiradaNaLoja(det.tipoEntrega)) continue
      for (const item of det.itens) {
        pecas.push({
          peca: item.peca,
          quantidade: item.quantidade,
          categoria: item.categoria,
          numeroPedido: p.numeroPedido,
          dataPedido: p.dataPedido,
          status,
        })
      }
    }
    return pecas
  })

  // `pecas` é o nome que a tela já usa; o helper devolve `dados`.
  return resultado.map(r => ({ ...r, pecas: r.dados }))
}
