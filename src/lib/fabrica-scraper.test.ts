import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsearDetalheCompra,
  ehRetiradaNaLoja,
  parsearStatusCompra,
  ehStatusFinalizado,
  loginAceito,
  explicarFalhaDeLogin,
  parsearListaTrocas,
} from './fabrica-scraper'

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

// ─── Status dos pedidos de compra ────────────────────────────────────────────

const selectStatus = (opcoes: string[]) => `
  <form method="get" action="/clientes/pedidos">
    <input type="hidden" name="aba" value="compras">
    <select name="status" class="bg-gray-700 text-white rounded px-3 py-2">
      <option value="">Todos os status</option>
      ${opcoes.map(o => `<option value="${o}">${o}</option>`).join('')}
    </select>
  </form>`

test('parsearStatusCompra: le as opcoes do filtro e ignora o "Todos" de value vazio', () => {
  const html = selectStatus(['Aguardando pagamento', 'Separado', 'Entregue'])
  assert.deepEqual(parsearStatusCompra(html).map(o => o.valor), [
    'Aguardando pagamento', 'Separado', 'Entregue',
  ])
})

test('parsearStatusCompra: sem select de status devolve vazio', () => {
  assert.deepEqual(parsearStatusCompra('<html><body>nada aqui</body></html>'), [])
})

test('parsearStatusCompra: nao repete status duplicado', () => {
  const html = selectStatus(['Separado', 'Separado'])
  assert.deepEqual(parsearStatusCompra(html), [{ valor: 'Separado', rotulo: 'Separado' }])
})

// Se o portal trocar o texto por id no value, é o rótulo que continua dizendo se
// o pedido já chegou — por isso os dois voltam separados.
test('parsearStatusCompra: separa o value (filtro) do rotulo (texto lido)', () => {
  const html = `<select name="status">
    <option value="">Todos</option>
    <option value="3">Em Transito</option>
    <option value="9">Entregue</option>
  </select>`
  assert.deepEqual(parsearStatusCompra(html), [
    { valor: '3', rotulo: 'Em Transito' },
    { valor: '9', rotulo: 'Entregue' },
  ])
})

test('ehStatusFinalizado: pedido que ja chegou (ou morreu) sai da conferencia', () => {
  for (const s of ['Entregue', 'entregue', 'Cancelado', 'Finalizado', 'Concluido', 'Devolvido', 'Recusado']) {
    assert.equal(ehStatusFinalizado(s), true, s)
  }
})

test('ehStatusFinalizado: pedido em aberto continua na lista', () => {
  for (const s of ['Aguardando pagamento', 'Separado', 'Em Transito', 'Em separacao', null]) {
    assert.equal(ehStatusFinalizado(s), false, String(s))
  }
})

// ─── Falha de login (bloqueio anti-robô de 01/09/2026) ───────────────────────
//
// A fábrica passou a exigir prova de trabalho resolvida em JavaScript para
// aceitar o POST de login. Quem não resolve leva 303 de VOLTA para /login — e o
// código tratava qualquer 303 como sucesso, quebrando só no passo seguinte com
// "possível credencial inválida". A mensagem mandava caçar senha errada.

const paginaComAlerta = (msg: string) =>
  `<html><body><div class="alert alert-danger" role="alert">${msg}</div></body></html>`

const ANTIBOT = 'Não foi possível confirmar que o acesso vem de um navegador. Atualize a página e tente novamente.'

test('redirect de volta para /login não é login aceito', () => {
  assert.equal(loginAceito(303, 'https://motochefebrasil.store/login'), false)
  assert.equal(loginAceito(302, '/login'), false)
})

test('redirect para a área do lojista é login aceito', () => {
  assert.equal(loginAceito(302, 'https://motochefebrasil.store/clientes'), true)
  assert.equal(loginAceito(303, '/clientes'), true)
})

test('200 sem redirect nenhum não é login aceito', () => {
  assert.equal(loginAceito(200, ''), false)
})

test('o bloqueio anti-robô é nomeado, e não confundido com senha errada', () => {
  const msg = explicarFalhaDeLogin(303, '/login', paginaComAlerta(ANTIBOT))
  assert.match(msg, /acesso automatizado/i)
  // Dizer "não é senha cadastrada" é justamente o ponto: o que não pode é a
  // mensagem ACUSAR a credencial e mandar o adm caçar senha errada.
  assert.doesNotMatch(msg, /credencial inválida|senha (incorreta|errada|inválida)/i)
  assert.match(msg, /não é senha/i)
})

test('credencial recusada de verdade continua dizendo que é credencial', () => {
  const msg = explicarFalhaDeLogin(303, '/login', paginaComAlerta('E-mail ou senha inválidos.'))
  assert.match(msg, /E-mail ou senha inválidos/)
})

test('sem alerta na página, informa o que deu para observar', () => {
  const msg = explicarFalhaDeLogin(303, '/login', '<html><body>nada aqui</body></html>')
  assert.match(msg, /303/)
  assert.match(msg, /\/login/)
})

test('a mensagem do portal chega limpa de marcação e espaço', () => {
  const html = [
    '<div class="alert alert-danger">',
    '  <strong>Erro:</strong>   conta   bloqueada',
    '</div>',
  ].join('\n')
  assert.match(explicarFalhaDeLogin(303, '/login', html), /Erro: conta bloqueada/)
})

// Linha fiel ao portal real (/clientes/trocas): duas datas por linha
// (solicitação e última movimentação, que pode ser "-") e dois badges
// rounded-full — o da entrega com ícone dentro, o de status só texto.
const linhaTroca = (o: { num: string; data: string; status: string; mov: string }) => `
  <tr class="border-b border-gray-700/50 hover:bg-gray-700/30 transition-colors">
    <td class="px-6 py-4 text-white font-mono text-sm">
        #${o.num}                                </td>
    <td class="px-6 py-4 text-white text-sm">
                ${o.data}                </td>
    <td class="px-6 py-4">
        <span class="inline-flex items-center gap-2 bg-yellow-500 text-white px-3 py-1.5 rounded-full text-xs font-semibold">
            <svg class="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><path d="M21 16V8"/></svg>
            Correios                                    </span>
    </td>
    <td class="px-6 py-4">
        <span class="inline-flex px-3 py-1.5 rounded-full text-xs font-semibold bg-green-600 text-white">
            ${o.status}                                    </span>
    </td>
    <td class="px-6 py-4 text-gray-400 text-sm">
                ${o.mov}                </td>
    <td class="px-6 py-4">
        <a href="https://motochefebrasil.store/clientes/trocas/detalhes/${o.num}">Detalhes</a>
    </td>
  </tr>`

test('lista de trocas: cada pedido leva a própria data de solicitação e o status', () => {
  const html = `<table><thead><tr><th>ID</th></tr></thead><tbody>
    ${linhaTroca({ num: '45095', data: '16/10/2026 14:13', status: 'Aguardando Separação', mov: '16/10/2026 16:40' })}
    ${linhaTroca({ num: '45088', data: '15/10/2026 13:54', status: 'Em avaliação SAC', mov: '-' })}
    ${linhaTroca({ num: '13491', data: '11/11/2025 09:51', status: 'Entregue', mov: '06/01/2026 16:33' })}
  </tbody></table>`

  assert.deepEqual(parsearListaTrocas(html), [
    { numeroPedido: '45095', dataAbertura: '2026-10-16', status: 'Aguardando Separação' },
    { numeroPedido: '45088', dataAbertura: '2026-10-15', status: 'Em avaliação SAC' },
    { numeroPedido: '13491', dataAbertura: '2025-11-11', status: 'Entregue' },
  ])
})

test('lista de trocas: página vazia devolve lista vazia', () => {
  assert.deepEqual(parsearListaTrocas('<table><tbody></tbody></table>'), [])
})
