import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizarCor, CORES_MOTO } from './cores-moto'

// Em 14/09/2026 uma JETMAX entrou como "PRETA" entre 451 "PRETO". O /compras
// agrupa por (modelo, cor), então ela virou uma linha própria com estoque zero
// e urgência crítica — pedindo reposição de uma cor que tinha 9 no showroom.
test('a variante feminina vira a grafia que a base usa', () => {
  assert.equal(normalizarCor('PRETA'), 'PRETO')
  assert.equal(normalizarCor('BRANCA'), 'BRANCO')
})

test('caixa e espaço sobrando não criam cor nova', () => {
  assert.equal(normalizarCor('  preta '), 'PRETO')
  assert.equal(normalizarCor('Preto'), 'PRETO')
  assert.equal(normalizarCor('azul   turquesa'), 'AZUL TURQUESA')
})

// A cor vem do XML da NF-e, escrito pela fábrica. Travar a entrada de uma moto
// porque apareceu um nome de cor novo seria parar o trabalho por cadastro — a
// cor entra como veio e alguém arruma depois.
test('cor desconhecida passa, só arrumada', () => {
  assert.equal(normalizarCor(' laranja neon '), 'LARANJA NEON')
})

test('a lista da tela não tem duas grafias da mesma cor', () => {
  for (const cor of CORES_MOTO) {
    assert.equal(normalizarCor(cor), cor, `${cor} não é a grafia canônica`)
  }
  assert.equal(new Set(CORES_MOTO).size, CORES_MOTO.length, 'cor repetida na lista')
})
