import test from 'node:test'
import assert from 'node:assert/strict'
import { cargosDoAlvo } from './cargos-opcoes'

const A = { id: 'a1', nome: 'Recepção', modulos: [], contaId: 'A' }
const B = { id: 'b1', nome: 'Caixa', modulos: [], contaId: 'B' }

test('select de cargo: os da Conta do usuário editado, não os da Conta ativa (#450)', () => {
  assert.deepEqual(cargosDoAlvo([A, B], 'B', 'A'), [B])
})

test('usuário novo ou sem Conta: cargos da Conta ativa (#450)', () => {
  assert.deepEqual(cargosDoAlvo([A, B], null, 'A'), [A])
})
