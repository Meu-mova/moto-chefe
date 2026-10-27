import test from 'node:test'
import assert from 'node:assert/strict'
import { opcoesComGravada } from './maquininhas-opcoes'

test('edição mostra as do grupo mais a operadora já gravada, sem repetir (#460)', () => {
  const doGrupo = [{ operadora: 'stone', nome: 'Stone' }]
  assert.deepEqual(opcoesComGravada(doGrupo, ['stone', 'cielo', undefined, 'cielo']), [
    { operadora: 'stone', nome: 'Stone' }, { operadora: 'cielo', nome: 'cielo' },
  ])
  assert.deepEqual(opcoesComGravada(null, []), [])
})
