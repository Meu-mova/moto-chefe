import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorNfEModelo, devolverTiradas, tirarMarcadas, type MotoImportada } from './entrada-lista'

const moto = (chassi: string, nf: string, modelo: string): MotoImportada =>
  ({ chassi, nf, modelo, cor: 'PRETO', motor: `M-${chassi}`, modeloId: 'id', preco: '100,00' })

// Mesma lista do protótipo aprovado: NF 43440 com R10 (3) e X12 (2), NF 43512 com GIGA (2).
const lista = [
  moto('R1', '43440', 'R10'), moto('R2', '43440', 'R10'), moto('R3', '43440', 'R10'),
  moto('X1', '43440', 'X12'), moto('X2', '43440', 'X12'),
  moto('G1', '43512', 'GIGA'), moto('G2', '43512', 'GIGA'),
]
const chassis = (ms: MotoImportada[]) => ms.map(m => m.chassi)

test('tirar uma moto deixa as outras na mesma ordem e guarda a posição da tirada', () => {
  const { ficam, tiradas } = tirarMarcadas(lista, new Set([1]))
  assert.deepEqual(chassis(ficam), ['R1', 'R3', 'X1', 'X2', 'G1', 'G2'])
  assert.deepEqual(tiradas.map(t => [t.idx, t.moto.chassi]), [[1, 'R2']])
})

test('tirar um modelo inteiro some com ele do agrupamento e baixa a contagem da NF', () => {
  const { ficam } = tirarMarcadas(lista, new Set([3, 4]))
  const grupos = agruparPorNfEModelo(ficam)
  assert.deepEqual(grupos.map(g => [g.nf, g.total, g.modelos.map(m => [m.modelo, m.motos.length])]), [
    ['43440', 3, [['R10', 3]]],
    ['43512', 2, [['GIGA', 2]]],
  ])
})

test('agrupamento guarda o índice de cada moto na lista e junta modelo sem diferenciar maiúscula', () => {
  const grupos = agruparPorNfEModelo([moto('A', '', 'r10'), moto('B', '', 'R10')])
  assert.equal(grupos[0].nf, 'SEM NF')
  assert.deepEqual(grupos[0].modelos.map(m => [m.modelo, m.motos.map(x => x.idx)]), [['R10', [0, 1]]])
})

test('desfazer devolve as tiradas na ordem original', () => {
  const { ficam, tiradas } = tirarMarcadas(lista, new Set([0, 3, 6]))
  assert.deepEqual(chassis(devolverTiradas(ficam, tiradas)), chassis(lista))
})

test('desfazer depois de acrescentar XML devolve na posição original e as novas ficam no fim', () => {
  const { ficam, tiradas } = tirarMarcadas(lista, new Set([1, 4]))
  const comNovas = [...ficam, moto('N1', '50000', 'R10')]
  assert.deepEqual(chassis(devolverTiradas(comNovas, tiradas)), [...chassis(lista), 'N1'])
})

test('desfazer não duplica chassi que voltou à lista por outro XML', () => {
  const { ficam, tiradas } = tirarMarcadas(lista, new Set([1, 2]))
  const reimportada = [...ficam, moto('r2', '43440', 'R10')]
  assert.deepEqual(chassis(devolverTiradas(reimportada, tiradas)), ['R1', 'R3', 'X1', 'X2', 'G1', 'G2', 'r2'])
})
