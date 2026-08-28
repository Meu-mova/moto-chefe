'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { paraCadaLojaNaFabrica, type ResultadoLojaFabrica } from '@/lib/fabrica-por-loja'
import {
  listarPedidosCompraFabrica,
  buscarDetalheCompraFabrica,
  ehRetiradaNaLoja,
  STATUS_SEPARADO,
} from '@/lib/fabrica-scraper'

const PAPEIS_PERMITIDOS = ['admin_geral', 'admin_socio', 'aux_adm']

export type PecaSeparada = {
  peca: string
  quantidade: number | null
  categoria: string | null
  numeroPedido: string
  /** "29/07/2026 18:17" como vem do portal. */
  dataPedido: string | null
}

export type LojaPecasSeparadas = ResultadoLojaFabrica<PecaSeparada> & { pecas: PecaSeparada[] }

/**
 * Lê no portal da fábrica, para cada loja do grupo do usuário, os pedidos de
 * compra com status "Separado" e devolve as peças que são de RETIRADA (as que
 * se pega no galpão — as de Correios a fábrica manda pelo malote).
 *
 * A lista de pedidos não traz o nome da peça nem o tipo de entrega, então abre
 * o detalhe de cada pedido separado. Leitura ao vivo, sem gravar nada.
 */
export async function listarPecasSeparadasAction(): Promise<LojaPecasSeparadas[]> {
  const u = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(u.papel)) throw new Error('Sem permissão')

  const resultado = await paraCadaLojaNaFabrica<PecaSeparada>(u, async session => {
    const separados = await listarPedidosCompraFabrica(session, STATUS_SEPARADO)
    // O portal filtra por texto e já vem certo, mas uma mudança de rótulo lá
    // devolveria a lista inteira — conferimos o status exato de cada linha.
    const doStatus = separados.filter(p => (p.status ?? '').trim().toLowerCase() === 'separado')

    const pecas: PecaSeparada[] = []
    for (const p of doStatus) {
      const det = await buscarDetalheCompraFabrica(session, p.numeroPedido)
      if (!ehRetiradaNaLoja(det.tipoEntrega)) continue
      for (const item of det.itens) {
        pecas.push({
          peca: item.peca,
          quantidade: item.quantidade,
          categoria: item.categoria,
          numeroPedido: p.numeroPedido,
          dataPedido: p.dataPedido,
        })
      }
    }
    return pecas
  })

  // `pecas` é o nome que a tela já usa; o helper devolve `dados`.
  return resultado.map(r => ({ ...r, pecas: r.dados }))
}
