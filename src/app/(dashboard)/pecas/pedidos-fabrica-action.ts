'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { paraCadaLojaNaFabrica, type ResultadoLojaFabrica } from '@/lib/fabrica-por-loja'
import {
  listarPedidosCompraFabrica,
  buscarDetalheCompraFabrica,
  listarStatusCompraAbertos,
  ehStatusFinalizado,
} from '@/lib/fabrica-scraper'

const PAPEIS_PERMITIDOS = ['admin_geral', 'admin_socio', 'aux_adm']

/** Uma linha por ITEM do pedido — é a peça que o balcão quer conferir, não o pedido. */
export type ItemCompraFabrica = {
  numeroPedido: string
  /** "29/07/2026 18:17" como vem do portal. */
  dataPedido: string | null
  status: string | null
  tipoEntrega: string | null
  peca: string
  categoria: string | null
  quantidade: number | null
}

export type LojaPedidosFabrica = ResultadoLojaFabrica<ItemCompraFabrica> & { itens: ItemCompraFabrica[] }

/**
 * Peças compradas na fábrica que ainda não chegaram, por loja — só conferência,
 * não grava nada.
 *
 * A lista de /clientes/pedidos traz número, data, valor e status, mas NÃO o nome
 * da peça nem a categoria; esses só existem no detalhe do pedido, então abrimos
 * um detalhe por pedido em aberto. É por isso que a tela pede um clique em vez de
 * carregar sozinha: são N logins + N requisições ao portal da fábrica.
 *
 * Os status em aberto vêm do próprio filtro do portal (ver listarStatusCompraAbertos)
 * porque o vocabulário completo não está documentado em lugar nenhum — assumir os
 * dois que o código já conhecia esconderia qualquer status novo da fábrica.
 */
export async function listarPedidosCompraFabricaAction(): Promise<LojaPedidosFabrica[]> {
  const u = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(u.papel)) throw new Error('Sem permissão')

  const resultado = await paraCadaLojaNaFabrica<ItemCompraFabrica>(u, async session => {
    const statusAbertos = await listarStatusCompraAbertos(session)

    // Um pedido pode aparecer em mais de uma consulta se a fábrica renomear um
    // status entre as requisições — deduplica pelo número.
    const porNumero = new Map<string, { dataPedido: string | null; status: string | null }>()
    for (const status of statusAbertos) {
      for (const p of await listarPedidosCompraFabrica(session, status)) {
        // O filtro é do portal; se ele devolver um entregue por engano, cortamos aqui.
        if (ehStatusFinalizado(p.status)) continue
        if (!porNumero.has(p.numeroPedido)) {
          porNumero.set(p.numeroPedido, { dataPedido: p.dataPedido, status: p.status ?? status })
        }
      }
    }

    const itens: ItemCompraFabrica[] = []
    for (const [numeroPedido, info] of porNumero) {
      const det = await buscarDetalheCompraFabrica(session, numeroPedido)
      for (const item of det.itens) {
        itens.push({
          numeroPedido,
          dataPedido: info.dataPedido,
          status: info.status,
          tipoEntrega: det.tipoEntrega,
          peca: item.peca,
          categoria: item.categoria,
          quantidade: item.quantidade,
        })
      }
    }

    // Mais recente primeiro; o número do pedido cresce com o tempo e é o único
    // campo confiável pra ordenar (a data vem como texto dd/mm/aaaa).
    return itens.sort((a, b) => Number(b.numeroPedido) - Number(a.numeroPedido))
  })

  return resultado.map(r => ({ ...r, itens: r.dados }))
}
