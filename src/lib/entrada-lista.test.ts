import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acrescentarDoXml, agruparPorNfEModelo, devolverTiradas, fichasDoEnvio, tirarMarcadas, type MotoImportada } from './entrada-lista'

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
  const { ficam, exclusao } = tirarMarcadas(lista, new Set([1]))
  assert.deepEqual(chassis(ficam), ['R1', 'R3', 'X1', 'X2', 'G1', 'G2'])
  assert.deepEqual(exclusao.tiradas.map(t => [t.idx, t.moto.chassi]), [[1, 'R2']])
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
  const { ficam, exclusao } = tirarMarcadas(lista, new Set([0, 3, 6]))
  assert.deepEqual(chassis(devolverTiradas(ficam, exclusao)), chassis(lista))
})

test('desfazer depois de acrescentar XML devolve na posição original e as novas ficam no fim', () => {
  const { ficam, exclusao } = tirarMarcadas(lista, new Set([1, 4]))
  const comNovas = [...ficam, moto('N1', '50000', 'R10')]
  assert.deepEqual(chassis(devolverTiradas(comNovas, exclusao)), [...chassis(lista), 'N1'])
})

test('desfazer não duplica chassi que voltou à lista por outro XML', () => {
  const { ficam, exclusao } = tirarMarcadas(lista, new Set([1, 2]))
  const reimportada = [...ficam, moto('r2', '43440', 'R10')]
  assert.deepEqual(chassis(devolverTiradas(reimportada, exclusao)), ['R1', 'R3', 'X1', 'X2', 'G1', 'G2', 'r2'])
})

test('fichas do envio: só das motos que estão na lista, uma por moto, na ordem da lista', () => {
  const emitente = (nfNumero: string) => ({ cnpj: '00000000000191', nome: 'Fabrica', nfNumero, nfChave: nfNumero.padStart(44, '0') })
  const ficha = { codigo: 'GIGA' } as unknown as NonNullable<MotoImportada['fiscal']>['ficha']
  const comFicha = (chassi: string, nf: string): MotoImportada => ({ ...moto(chassi, nf, 'GIGA'), fiscal: { emitente: emitente(nf), ficha } })
  const linhas = [comFicha('G1', '222'), moto('P1', '9', 'R10'), comFicha('G2', '222')]
  assert.deepEqual(fichasDoEnvio(linhas).map(f => [f.chassi, f.emitente.nfNumero]), [['G1', '222'], ['G2', '222']])
})

test('planilha com chassi repetido: tirar uma das cópias e desfazer devolve a cópia', () => {
  const comRepetido = [moto('A1', '1', 'R10'), moto('A1', '1', 'R10'), moto('B1', '1', 'R10')]
  const { ficam, exclusao } = tirarMarcadas(comRepetido, new Set([1]))
  assert.deepEqual(chassis(devolverTiradas(ficam, exclusao)), ['A1', 'A1', 'B1'])
})

test('acrescentar do XML: moto nova vai para o fim; chassi já na lista sem ficha só ganha a ficha', () => {
  const emitente = { cnpj: '00000000000191', nome: 'Fabrica', nfNumero: '111', nfChave: '1'.padStart(44, '0') }
  const ficha = { codigo: 'GIGA' } as unknown as NonNullable<MotoImportada['fiscal']>['ficha']
  const daPlanilha = { ...moto('G1', '111', 'GIGA'), preco: '5.000,00' }
  const doXml = (chassi: string): MotoImportada => ({ ...moto(chassi, '111', 'GIGA'), preco: '6400.00', fiscal: { emitente, ficha } })

  const lista = acrescentarDoXml([daPlanilha], [doXml('g1'), doXml('G2')])

  assert.deepEqual(chassis(lista), ['G1', 'G2'])
  assert.equal(lista[0].preco, '5.000,00', 'a linha da planilha fica como estava')
  assert.deepEqual(lista[0].fiscal, { emitente, ficha })
})

test('acrescentar do XML: chassi que já tem ficha fica com a dele', () => {
  const emitente = (nfNumero: string) => ({ cnpj: '00000000000191', nome: 'Fabrica', nfNumero, nfChave: nfNumero.padStart(44, '0') })
  const ficha = { codigo: 'GIGA' } as unknown as NonNullable<MotoImportada['fiscal']>['ficha']
  const comFicha = (nf: string): MotoImportada => ({ ...moto('G1', nf, 'GIGA'), fiscal: { emitente: emitente(nf), ficha } })
  const lista = acrescentarDoXml([comFicha('111')], [comFicha('222')])
  assert.equal(lista.length, 1)
  assert.equal(lista[0].fiscal?.emitente.nfNumero, '111')
})
