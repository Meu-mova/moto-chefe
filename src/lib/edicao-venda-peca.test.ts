import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisosDaEdicao, diferencaDeEstoque, resumoDaEdicao } from './edicao-venda-peca'

test('estoque: baixa só a diferença, devolve o que saiu e junta peça repetida', () => {
  const antes = [{ pecaId: 'a', quantidade: 2 }, { pecaId: 'b', quantidade: 1 }]
  const depois = [{ pecaId: 'a', quantidade: 1 }, { pecaId: 'a', quantidade: 3 }, { pecaId: 'c', quantidade: 5 }]
  // a: 2 → 4 (baixa mais 2); b: sai (devolve 1); c: entra (baixa 5)
  assert.deepEqual(diferencaDeEstoque(antes, depois), new Map([['a', 2], ['b', -1], ['c', 5]]))
})

test('estoque: peça sem mudança de quantidade não aparece', () => {
  const itens = [{ pecaId: 'a', quantidade: 2 }]
  assert.equal(diferencaDeEstoque(itens, itens).size, 0)
})

test('resumo diz o que entrou, saiu, mudou de quantidade e o novo total', () => {
  const r = resumoDaEdicao(
    { itens: [{ descricao: 'Retrovisor', quantidade: 1 }, { descricao: 'Pneu', quantidade: 2 }], formaPagamento: 'pix', valorTotal: 300 },
    { itens: [{ descricao: 'Pneu', quantidade: 1 }, { descricao: 'Capacete', quantidade: 1 }], formaPagamento: 'multiplo', valorTotal: 250 },
  )
  assert.match(r, /\+ Capacete/)
  assert.match(r, /- Retrovisor/)
  assert.match(r, /Pneu: 2 → 1/)
  assert.match(r, /Pagamento: pix → multiplo/)
  assert.match(r, /Total: R\$ 300,00 → R\$ 250,00/)
})

test('resumo de edição que não muda nada', () => {
  const v = { itens: [{ descricao: 'Pneu', quantidade: 1 }], formaPagamento: 'pix', valorTotal: 100 }
  assert.equal(resumoDaEdicao(v, v), 'Sem mudança nos itens ou pagamentos')
})

test('avisos: conciliação vinculada e mês anterior; nada quando a venda é deste mês e solta', () => {
  const agora = new Date('2026-10-20T15:00:00Z')
  assert.deepEqual(avisosDaEdicao({ conciliada: false, dataVenda: new Date('2026-10-01T12:00:00Z'), agora }), [])
  const avisos = avisosDaEdicao({ conciliada: true, dataVenda: new Date('2026-09-30T12:00:00Z'), agora })
  assert.equal(avisos.length, 2)
  assert.match(avisos[0], /conciliação/)
  assert.match(avisos[1], /mês anterior/)
})

test('avisos usam o mês de Brasília: venda de 30/09 às 22h BRT é de setembro', () => {
  const agora = new Date('2026-10-01T12:00:00Z')
  // 2026-10-01T01:00Z = 30/09 22h em Brasília
  assert.equal(avisosDaEdicao({ conciliada: false, dataVenda: new Date('2026-10-01T01:00:00Z'), agora }).length, 1)
})
