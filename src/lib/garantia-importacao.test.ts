import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escolherMotoPorChassi, normalizarNumeroPedido, garantiaEmAndamento } from './garantia-importacao'

const moto = (id: string, chassi: string) => ({ id, lojaId: 'loja-1', chassi })

test('número do pedido: "#38780" e "38780" são o mesmo', () => {
  assert.equal(normalizarNumeroPedido('#38780'), '38780')
  assert.equal(normalizarNumeroPedido(' 38780 '), '38780')
  assert.equal(normalizarNumeroPedido(null), '')
})

test('chassi exato vence o casamento pelo final', () => {
  const motos = [moto('a', 'XX3024'), moto('b', '3024')]
  assert.equal(escolherMotoPorChassi('3024', motos)?.id, 'b')
})

test('chassi exato ignora caixa e espaço', () => {
  assert.equal(escolherMotoPorChassi(' lydae3939t1206293 ', [moto('a', 'LYDAE3939T1206293')])?.id, 'a')
})

test('chassi abreviado casa pelo final quando só uma moto termina assim', () => {
  const motos = [moto('a', '17292250623024'), moto('b', 'LA2025SA110005122')]
  assert.equal(escolherMotoPorChassi('3024', motos)?.id, 'a')
  assert.equal(escolherMotoPorChassi('5122', motos)?.id, 'b')
})

test('chassi abreviado ambíguo não escolhe moto nenhuma', () => {
  const motos = [moto('a', 'AAA3024'), moto('b', 'BBB3024')]
  assert.equal(escolherMotoPorChassi('3024', motos), null)
})

test('final curto demais não serve de chave', () => {
  assert.equal(escolherMotoPorChassi('024', [moto('a', '17292250623024')]), null)
})

test('sem candidata ou chassi vazio devolve null', () => {
  assert.equal(escolherMotoPorChassi('3024', []), null)
  assert.equal(escolherMotoPorChassi('  ', [moto('a', '3024')]), null)
})

test('garantiaEmAndamento: as situações em andamento do portal entram, com ou sem acento', () => {
  for (const s of ['Aguardando devolução', 'Aguardando postagem reversa', 'Aguardando Reposição', 'Aguardando Separação',
    'Em auditoria', 'Em avaliação do técnico', 'Em avaliação SAC', 'Em conferência', 'Em Exigência', 'Em separação',
    'Pedido enviado', 'Separado', 'Em avaliacao SAC']) {
    assert.equal(garantiaEmAndamento(s), true, s)
  }
})

test('garantiaEmAndamento: encerrada, desconhecida ou sem situação fica de fora', () => {
  for (const s of ['Cancelado', 'CANCELADA', 'Entregue', 'Garantia concluída', 'Retirado', 'Resolvido', '', null, undefined]) {
    assert.equal(garantiaEmAndamento(s), false, String(s))
  }
})
