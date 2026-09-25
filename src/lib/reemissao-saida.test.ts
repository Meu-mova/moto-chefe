import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parearReemissoes, type SaidaParaParear } from './reemissao-saida'

const CONTA = '950fbd48-6b12-4cd8-98ce-7759beb6e474'

function saida(id: string, data: string, valor: string, descricao: string, contaId = CONTA): SaidaParaParear {
  return { id, contaId, data: new Date(data), valor, descricao }
}

// Linhas reais de 21/09/2026: a antiga veio à meia-noite com "@", a reemissão de
// 24/09 veio com o horário real e em caixa alta.
test('reconhece o PIX reemitido com horário e descrição diferentes', () => {
  const antiga = saida('velha', '2026-09-21T03:00:00Z', '-12528.91', 'PIX EMITIDO OUTRA IF - Pagamento Pix|@***.386.616-**|@')
  const nova = saida('nova', '2026-09-21T15:22:10.54Z', '-12528.91', 'PIX EMITIDO OUTRA IF - PAGAMENTO PIX|***.386.616-**|')
  const pares = parearReemissoes([nova], [antiga])
  assert.equal(pares.length, 1)
  assert.equal(pares[0].antiga.id, 'velha')
})

test('ignora acento e caixa na descrição', () => {
  const antiga = saida('velha', '2026-09-21T03:00:00Z', '-610.51', 'DÉB.TÍTULO COBRANÇA - Combustível galpao')
  const nova = saida('nova', '2026-09-21T13:03:54Z', '-610.51', 'DÉB.TÍTULO COBRANÇA - COMBUSTÍVEL GALPAO')
  assert.equal(parearReemissoes([nova], [antiga]).length, 1)
})

test('não pareia dia, valor, conta ou favorecido diferentes', () => {
  const antiga = saida('velha', '2026-09-21T03:00:00Z', '-144.00', 'PIX|@48.958.877 0001-16|@')
  assert.equal(parearReemissoes([saida('n1', '2026-09-22T12:00:00Z', '-144.00', 'PIX|48.958.877 0001-16|')], [antiga]).length, 0)
  assert.equal(parearReemissoes([saida('n2', '2026-09-21T12:00:00Z', '-145.00', 'PIX|48.958.877 0001-16|')], [antiga]).length, 0)
  assert.equal(parearReemissoes([saida('n3', '2026-09-21T12:00:00Z', '-144.00', 'PIX|48.958.877 0001-16|', 'outra')], [antiga]).length, 0)
  assert.equal(parearReemissoes([saida('n4', '2026-09-21T12:00:00Z', '-144.00', 'PIX|11.111.111 0001-11|')], [antiga]).length, 0)
})

test('meia-noite de Brasília é 03:00 UTC, então 02:59 UTC ainda é o dia anterior', () => {
  const antiga = saida('velha', '2026-09-21T03:00:00Z', '-5.15', 'DÉBITO PEDÁGIO SICOOB TAG')
  assert.equal(parearReemissoes([saida('n', '2026-09-21T02:59:00Z', '-5.15', 'DÉBITO PEDÁGIO SICOOB TAG')], [antiga]).length, 0)
})

test('pedágios repetidos pareiam um a um, e o que sobra fica como saída nova', () => {
  const antigas = [
    saida('v1', '2026-09-21T03:00:00Z', '-15.15', 'DÉBITO PEDÁGIO SICOOB TAG'),
    saida('v2', '2026-09-21T03:00:00Z', '-15.15', 'DÉBITO PEDÁGIO SICOOB TAG'),
  ]
  const novas = [
    saida('n1', '2026-09-21T11:44:53Z', '-15.15', 'DÉBITO PEDÁGIO SICOOB TAG'),
    saida('n2', '2026-09-21T12:15:15Z', '-15.15', 'DÉBITO PEDÁGIO SICOOB TAG'),
    saida('n3', '2026-09-21T18:24:30Z', '-15.15', 'DÉBITO PEDÁGIO SICOOB TAG'),
  ]
  const pares = parearReemissoes(novas, antigas)
  assert.deepEqual(pares.map(p => [p.nova.id, p.antiga.id]), [['n1', 'v1'], ['n2', 'v2']])
})
