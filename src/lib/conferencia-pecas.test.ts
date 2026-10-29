import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linhaInicial, problemaDaLinha, avisoDaLinha, resumoDaLinha, paraGravacao } from './conferencia-pecas'

const item = (p: Partial<{ quantidade: number; unidade: string }> = {}) => ({
  codigo: '26302', nomeXml: 'CAPACETE AZUL &amp; PRETO', nomeLegivel: 'CAPACETE AZUL & PRETO', unidade: p.unidade ?? 'PECAS',
  quantidade: p.quantidade ?? 2, quantidadeInteira: Number.isInteger(p.quantidade ?? 2) && (p.quantidade ?? 2) > 0, custoUnitario: 32.61, ncm: '65069900',
})

test('linha com sugestão começa no catálogo; sem sugestão, como peça nova com o nome legível', () => {
  assert.deepEqual(linhaInicial(item(), 'p1'), { item: item(), quantidade: '2', destino: 'catalogo', pecaId: 'p1', nome: '', preco: '' })
  assert.deepEqual(linhaInicial(item(), null), { item: item(), quantidade: '2', destino: 'nova', pecaId: '', nome: 'CAPACETE AZUL & PRETO', preco: '' })
})

test('quantidade com decimal vem como está, e a linha fica com problema até corrigir', () => {
  const l = linhaInicial(item({ quantidade: 1.5 }), 'p1')
  assert.equal(l.quantidade, '1,5')
  assert.equal(problemaDaLinha(l), 'A quantidade precisa ser um número inteiro maior que zero.')
  assert.equal(problemaDaLinha({ ...l, quantidade: '2' }), null)
})

test('peça nova sem preço, ou do catálogo sem peça escolhida, tem problema; "não dar entrada" nunca tem', () => {
  const nova = linhaInicial(item(), null)
  assert.equal(problemaDaLinha(nova), 'Informe o preço de venda da peça nova.')
  assert.equal(problemaDaLinha({ ...nova, preco: '79.90' }), null)
  assert.equal(problemaDaLinha({ ...nova, nome: '  ', preco: '79.90' }), 'Informe o nome da peça nova.')
  assert.equal(problemaDaLinha({ ...nova, destino: 'catalogo' }), 'Escolha a peça do catálogo.')
  assert.equal(problemaDaLinha({ ...nova, destino: 'ignorar', quantidade: '1,5' }), null)
})

test('unidade de caixa ou kit gera aviso, que não impede gravar', () => {
  for (const unidade of ['CX', 'cx', 'KIT', 'CAIXA', 'PCT']) {
    assert.match(avisoDaLinha(linhaInicial(item({ unidade }), 'p1')) ?? '', /confira quantas unidades entram/)
  }
  assert.equal(avisoDaLinha(linhaInicial(item({ unidade: 'UN' }), 'p1')), null)
})

test('resumo diz o que vai acontecer com a linha', () => {
  const l = linhaInicial(item(), null)
  assert.equal(resumoDaLinha(l, 'Loja Centro'), 'Vai cadastrar a peça e somar 2 unidades na Loja Centro.')
  assert.equal(resumoDaLinha({ ...l, destino: 'catalogo', pecaId: 'p1' }, 'Loja Centro', 'Capacete azul'), 'Vai somar 2 unidades em Capacete azul na Loja Centro.')
  assert.equal(resumoDaLinha({ ...l, destino: 'ignorar' }, 'Loja Centro'), 'Esta linha não entra no estoque.')
})

test('para gravar: pula "não dar entrada", converte quantidade e preço, e manda o xProd cru', () => {
  const nova = { ...linhaInicial(item(), null), preco: '79.90', nome: ' Capacete azul ' }
  const cat = { ...linhaInicial(item({ quantidade: 4 }), 'p1') }
  const fora = { ...linhaInicial(item(), null), destino: 'ignorar' as const }
  assert.deepEqual(paraGravacao([nova, cat, fora]), [
    { codigo: '26302', nomeXml: 'CAPACETE AZUL &amp; PRETO', quantidade: 2, custoUnitario: 32.61, nova: { nome: 'Capacete azul', valor: 79.9 } },
    { codigo: '26302', nomeXml: 'CAPACETE AZUL &amp; PRETO', quantidade: 4, custoUnitario: 32.61, pecaId: 'p1' },
  ])
})

test('preço vem do campo de moeda ("79.90", em reais com ponto); quantidade digitada aceita vírgula ou ponto', () => {
  const nova = { ...linhaInicial(item(), null), nome: 'X' }
  const valor = (preco: string) => (paraGravacao([{ ...nova, preco }])[0] as { nova: { valor: number } }).nova.valor
  assert.equal(valor('79.90'), 79.9)
  assert.equal(valor('1234.50'), 1234.5)
  assert.equal(problemaDaLinha({ ...nova, preco: '' }), 'Informe o preço de venda da peça nova.')
  assert.equal(problemaDaLinha({ ...nova, preco: '0.00' }), 'Informe o preço de venda da peça nova.')
  const qtd = (quantidade: string) => paraGravacao([{ ...nova, preco: '10.00', quantidade }])[0].quantidade
  assert.equal(qtd('3'), 3)
  assert.equal(problemaDaLinha({ ...nova, preco: '10.00', quantidade: '1.5' }), 'A quantidade precisa ser um número inteiro maior que zero.')
  assert.equal(problemaDaLinha({ ...nova, preco: '10.00', quantidade: '1,5' }), 'A quantidade precisa ser um número inteiro maior que zero.')
})
