import { test } from 'node:test'
import assert from 'node:assert/strict'
import { formatarAvisoPedidosFabrica, diasEntre, statusDaLeitura, type PedidoAviso } from './pedidos-fabrica'
import { parsearPedidosCompra } from '@/lib/fabrica-scraper'

// Recorte fiel do HTML de /clientes/pedidos?aba=compras capturado em 30/07/2026.
const HTML_REAL = `
<table>
<thead><tr class="border-b border-gray-700">
  <th class="text-left py-3 px-4 text-gray-400 font-semibold">Nº Pedido</th>
  <th class="text-left py-3 px-4 text-gray-400 font-semibold">Data</th>
  <th class="text-left py-3 px-4 text-gray-400 font-semibold">Valor Total</th>
  <th class="text-left py-3 px-4 text-gray-400 font-semibold">Método</th>
  <th class="text-left py-3 px-4 text-gray-400 font-semibold">Status</th>
  <th class="text-left py-3 px-4 text-gray-400 font-semibold">Última Movimentação</th>
  <th class="text-left py-3 px-4 text-gray-400 font-semibold">Ações</th>
</tr></thead>
<tbody>
<tr class="border-b border-gray-700 hover:bg-gray-700 hover:bg-opacity-30 transition-colors">
  <td class="py-3 px-4 text-white font-mono">
      #24103                            </td>
  <td class="py-3 px-4 text-gray-300">29/07/2026 18:17</td>
  <td class="py-3 px-4 text-white font-semibold">
      R$ 202,90                    </td>
  <td class="py-3 px-4 text-gray-300">Pix</td>
  <td class="py-3 px-4">
      <span class="px-3 py-1.5 rounded-full text-xs font-semibold bg-yellow-500 text-white">
          Aguardando Pagamento                    </span>
  </td>
  <td class="py-3 px-4 text-gray-300">30/07/2026 10:46</td>
  <td class="py-3 px-4"><div class="flex items-center gap-2">
      <a href="https://motochefebrasil.store/clientes/pedido/24103" class="text-yellow-400">
          <svg xmlns="http://www.w3.org/2000/svg" data-lucide="eye" class="lucide lucide-eye w-4 h-4 inline mr-1"><path d="M2.062 12.348a1 1 0 0 1 0-.696"></path></svg>
          Detalhes
      </a>
  </div></td>
</tr>
<tr class="border-b border-gray-700 hover:bg-gray-700 hover:bg-opacity-30 transition-colors">
  <td class="py-3 px-4 text-white font-mono">#23980</td>
  <td class="py-3 px-4 text-gray-300">28/07/2026 16:23</td>
  <td class="py-3 px-4 text-white font-semibold">R$ 1.120,50</td>
  <td class="py-3 px-4 text-gray-300">Boleto</td>
  <td class="py-3 px-4">
      <span class="px-3 py-1.5 rounded-full text-xs font-semibold bg-gray-500 text-white">Aguardando Reposicao</span>
  </td>
  <td class="py-3 px-4 text-gray-300">29/07/2026 11:20</td>
  <td class="py-3 px-4"><a href="https://motochefebrasil.store/clientes/pedido/23980">Detalhes</a></td>
</tr>
</tbody>
</table>`

test('parsearPedidosCompra extrai número, data, valor, método e status', () => {
  const pedidos = parsearPedidosCompra(HTML_REAL)

  assert.equal(pedidos.length, 2)
  assert.deepEqual(pedidos[0], {
    numeroPedido: '24103',
    dataPedido:   '29/07/2026 18:17',
    valor:        202.9,
    metodo:       'Pix',
    status:       'Aguardando Pagamento',
  })
})

test('parsearPedidosCompra lê valor com separador de milhar', () => {
  const pedidos = parsearPedidosCompra(HTML_REAL)
  assert.equal(pedidos[1].valor, 1120.5)
  assert.equal(pedidos[1].metodo, 'Boleto')
  assert.equal(pedidos[1].status, 'Aguardando Reposicao')
})

test('parsearPedidosCompra ignora o cabeçalho e não repete pedido', () => {
  const pedidos = parsearPedidosCompra(HTML_REAL + HTML_REAL)
  assert.deepEqual(pedidos.map(p => p.numeroPedido), ['24103', '23980'])
})

test('parsearPedidosCompra devolve vazio em página sem pedidos', () => {
  assert.deepEqual(parsearPedidosCompra('<table><tbody></tbody></table>'), [])
})

const NOVO: PedidoAviso = {
  numeroPedido: '24103', valor: 202.9, metodo: 'Pix',
  dataPedido: '29/07/2026 18:17', diasPendente: 0,
}

test('aviso lista os novos com valor, método e data', () => {
  const texto = formatarAvisoPedidosFabrica({ loja: 'Pouso Alegre', novos: [NOVO], pendentes: [] })
  assert.ok(texto)
  assert.match(texto, /Pouso Alegre/)
  assert.match(texto, /🆕 Novo:/)
  assert.match(texto, /#24103 · R\$ 202,90 · Pix · aberto 29\/07/)
})

test('aviso mostra há quantos dias o pendente está parado', () => {
  const texto = formatarAvisoPedidosFabrica({
    loja: 'Raja BH',
    novos: [],
    pendentes: [{ ...NOVO, numeroPedido: '23900', diasPendente: 3 }],
  })
  assert.ok(texto)
  assert.match(texto, /Ainda pendente:/)
  assert.match(texto, /há 3 dias/)
})

test('aviso usa singular no primeiro dia', () => {
  const texto = formatarAvisoPedidosFabrica({
    loja: 'Raja BH', novos: [], pendentes: [{ ...NOVO, diasPendente: 1 }],
  })
  assert.match(texto!, /há 1 dia$|há 1 dia\n/m)
})

test('sem pedido nenhum não gera mensagem', () => {
  assert.equal(formatarAvisoPedidosFabrica({ loja: 'Raja BH', novos: [], pendentes: [] }), null)
})

test('pedido sem valor não vira "R$ null"', () => {
  const texto = formatarAvisoPedidosFabrica({
    loja: 'Raja BH', novos: [{ ...NOVO, valor: null, metodo: null, dataPedido: null }], pendentes: [],
  })
  assert.match(texto!, /#24103 · valor não informado/)
})

test('diasEntre conta dias de calendário', () => {
  assert.equal(diasEntre(new Date('2026-07-27T23:00:00Z'), new Date('2026-07-30T01:00:00Z')), 3)
  assert.equal(diasEntre(new Date('2026-07-30T01:00:00Z'), new Date('2026-07-30T23:00:00Z')), 0)
})

test('diasEntre não devolve negativo se o relógio voltar', () => {
  assert.equal(diasEntre(new Date('2026-07-30T00:00:00Z'), new Date('2026-07-28T00:00:00Z')), 0)
})

// O card do dashboard depende disto para não confundir "nenhum pedido" com
// "ninguém leu a conta desta loja".
test('statusDaLeitura: só sem_credencial e erro contam como falha de leitura', () => {
  const base = { loja: 'Poços', grupo: 'Sul de Minas' } as const
  assert.equal(statusDaLeitura({ ...base, status: 'enviado' }), 'ok')
  assert.equal(statusDaLeitura({ ...base, status: 'nada_pendente' }), 'ok')
  // Leu certo, gravou os pedidos, só não tinha para quem avisar.
  assert.equal(statusDaLeitura({ ...base, status: 'sem_numero' }), 'ok')
  // Leitura manual do dashboard: leu e gravou, e de propósito não avisou.
  assert.equal(statusDaLeitura({ ...base, status: 'lido' }), 'ok')
  assert.equal(statusDaLeitura({ ...base, status: 'sem_credencial' }), 'sem_credencial')
  assert.equal(statusDaLeitura({ ...base, status: 'erro' }), 'erro')
})
