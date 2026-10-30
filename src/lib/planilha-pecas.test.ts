import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerPlanilhaPecas } from '@/lib/planilha-pecas'

const CABECALHO = ['CÓDIGO', 'DESCRIÇÃO', 'QUANTIDADE', 'CUSTO UNITÁRIO', 'PREÇO DE VENDA']

test('lê vírgula decimal, R$, milhar e número do Excel', () => {
  const r = lerPlanilhaPecas([
    CABECALHO,
    [26302, 'Capacete azul', 4, 32.61, 79.9],
    ['A-1', ' Retrovisor ', '2', 'R$ 1.234,50', '15,5'],
  ])
  assert.deepEqual(r.erros, [])
  assert.deepEqual(r.itens, [
    { linha: 2, codigo: '26302', descricao: 'Capacete azul', quantidade: 4, custoUnitario: 32.61, precoVenda: 79.9 },
    { linha: 3, codigo: 'A-1', descricao: 'Retrovisor', quantidade: 2, custoUnitario: 1234.5, precoVenda: 15.5 },
  ])
})

test('cabeçalho sem acento, em minúsculas e fora de ordem; colunas opcionais ausentes', () => {
  const r = lerPlanilhaPecas([['quantidade', 'descricao'], [3, 'Luva']])
  assert.deepEqual(r.erros, [])
  assert.deepEqual(r.itens, [{ linha: 2, codigo: '', descricao: 'Luva', quantidade: 3, custoUnitario: 0, precoVenda: null }])
})

test('pula linhas vazias, inclusive antes do cabeçalho', () => {
  const r = lerPlanilhaPecas([[], ['', null], CABECALHO, ['', '', '', '', ''], [null, 'Luva', 1], []])
  assert.deepEqual(r.erros, [])
  assert.deepEqual(r.itens.map(i => [i.linha, i.descricao]), [[5, 'Luva']])
})

test('sem DESCRIÇÃO ou QUANTIDADE no cabeçalho: erro e nenhum item', () => {
  const r = lerPlanilhaPecas([['CÓDIGO', 'QUANTIDADE'], ['1', 2]])
  assert.deepEqual(r.itens, [])
  assert.deepEqual(r.erros, ['A planilha precisa das colunas DESCRIÇÃO e QUANTIDADE'])
  assert.deepEqual(lerPlanilhaPecas([]).erros, ['A planilha precisa das colunas DESCRIÇÃO e QUANTIDADE'])
})

test('cada erro aponta a linha da planilha', () => {
  const r = lerPlanilhaPecas([
    CABECALHO,
    ['1', '', 2],
    ['2', 'Luva', 1.5],
    ['3', 'Pneu', 0],
    ['4', 'Farol', 1, 'abc'],
    ['5', 'Buzina', 1, -1, 'dez'],
  ])
  assert.deepEqual(r.itens, [])
  assert.deepEqual(r.erros, [
    'Linha 2: falta a descrição',
    'Linha 3: a quantidade precisa ser um número inteiro maior que zero',
    'Linha 4: a quantidade precisa ser um número inteiro maior que zero',
    'Linha 5: custo unitário inválido',
    'Linha 6: custo unitário inválido',
    'Linha 6: preço de venda inválido',
  ])
})
