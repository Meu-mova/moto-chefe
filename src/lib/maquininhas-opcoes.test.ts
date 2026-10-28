import test from 'node:test'
import assert from 'node:assert/strict'
import { opcoesComGravada, textoSemOperadora } from './maquininhas-opcoes'

test('edição mostra as do grupo mais a operadora já gravada, sem repetir (#460)', () => {
  const doGrupo = [{ operadora: 'stone', nome: 'Stone' }]
  assert.deepEqual(opcoesComGravada(doGrupo, ['stone', 'cielo', undefined, 'cielo']), [
    { operadora: 'stone', nome: 'Stone' }, { operadora: 'cielo', nome: 'Cielo' },
  ])
  assert.deepEqual(opcoesComGravada(null, []), [])
})

test('operadora gravada sem maquininha no grupo aparece com o nome da marca (#460)', () => {
  const nomes = opcoesComGravada([], ['infinitypay', 'pagueveloz', 'stone', 'getnet', 'redecard', 'outra']).map(m => m.nome)
  assert.deepEqual(nomes, ['InfinityPay', 'PagueVeloz', 'Stone', 'GetNet', 'Redecard', 'outra'])
})

test('select de operadora vazio avisa quando o grupo não tem maquininha (#460)', () => {
  assert.equal(textoSemOperadora([]), 'Nenhuma maquininha cadastrada')
  assert.equal(textoSemOperadora([{ operadora: 'stone', nome: 'Stone' }]), 'Operadora')
  assert.equal(textoSemOperadora(null), 'Operadora')
})
