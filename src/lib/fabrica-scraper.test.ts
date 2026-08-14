import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parsearDetalheCompra, ehRetiradaNaLoja } from './fabrica-scraper'

// Markup fiel ao portal real (/clientes/pedido/N): rótulo "Tipo de Entrega" num
// <label> seguido de um <span> com o valor, e cada item num <h3> com "Categoria"
// e "Quantidade: N x R$ ..." logo abaixo.
const bloco = (opts: { entrega: string; itens: { peca: string; cat: string; qtd: number }[] }) => `
  <label class="block text-sm font-medium text-gray-300 mb-1">Tipo de Entrega:</label>
  <span class="px-4 py-2 rounded text-sm font-semibold inline-block bg-blue-500 text-white">
      ${opts.entrega}
  </span>
  <h2 class="text-white text-xl font-semibold mb-6">Itens do Pedido (${opts.itens.length})</h2>
  <div class="space-y-4">
    ${opts.itens.map(i => `
      <div class="bg-gray-700 rounded-lg p-4 flex items-center justify-between">
        <div class="flex-1">
          <h3 class="text-white font-semibold text-lg">${i.peca}</h3>
          <p class="text-gray-400 text-sm mb-1">Categoria: ${i.cat}</p>
          <p class="text-gray-300 text-sm">Quantidade: ${i.qtd} x R$ 14,40</p>
        </div>
        <div class="text-yellow-400 text-xl font-bold">R$ 144,00</div>
      </div>`).join('')}
  </div>`

test('detalhe Correios: tipo de entrega e item com quantidade/categoria', () => {
  const html = bloco({ entrega: 'Correios', itens: [{ peca: 'Pastilha de Freio Traseiro', cat: 'JET', qtd: 10 }] })
  const d = parsearDetalheCompra(html)
  assert.equal(d.tipoEntrega, 'Correios')
  assert.equal(d.itens.length, 1)
  assert.deepEqual(d.itens[0], { peca: 'Pastilha de Freio Traseiro', quantidade: 10, categoria: 'JET' })
})

test('detalhe Retirada na Loja (valor real do portal)', () => {
  const html = bloco({ entrega: 'Retirada na Loja', itens: [{ peca: 'Par Retrovisor Scooter', cat: 'X12', qtd: 6 }] })
  const d = parsearDetalheCompra(html)
  assert.equal(d.tipoEntrega, 'Retirada na Loja')
  assert.deepEqual(d.itens[0], { peca: 'Par Retrovisor Scooter', quantidade: 6, categoria: 'X12' })
})

test('detalhe com múltiplos itens', () => {
  const html = bloco({ entrega: 'Retirada na Loja', itens: [
    { peca: 'Seta Dianteira Direita', cat: 'JET', qtd: 1 },
    { peca: 'Seta Dianteira Esquerda', cat: 'JET', qtd: 2 },
  ] })
  const d = parsearDetalheCompra(html)
  assert.equal(d.itens.length, 2)
  assert.equal(d.itens[1].peca, 'Seta Dianteira Esquerda')
  assert.equal(d.itens[1].quantidade, 2)
})

test('ignora <h3> de título que não é item (sem Quantidade logo abaixo)', () => {
  const html = `
    <h3 class="text-white">Meus Pedidos</h3>
    <h1>Pedido #24103</h1>
    ${bloco({ entrega: 'Correios', itens: [{ peca: 'GARFO COMPLETO', cat: 'BOB', qtd: 1 }] })}`
  const d = parsearDetalheCompra(html)
  assert.equal(d.itens.length, 1)
  assert.equal(d.itens[0].peca, 'GARFO COMPLETO')
})

test('sem tipo de entrega devolve null, sem quebrar', () => {
  const d = parsearDetalheCompra('<div>página sem entrega</div>')
  assert.equal(d.tipoEntrega, null)
  assert.deepEqual(d.itens, [])
})

test('ehRetiradaNaLoja: pega "Retirada na Loja", rejeita Correios/nulo', () => {
  assert.equal(ehRetiradaNaLoja('Retirada na Loja'), true)
  assert.equal(ehRetiradaNaLoja('retirada'), true)
  assert.equal(ehRetiradaNaLoja('Correios'), false)
  assert.equal(ehRetiradaNaLoja(null), false)
})
