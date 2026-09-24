import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ligarFichasAosChassis } from './nfe-fiscal'
import type { FichaFiscal } from './nfe-fiscal'

const ficha = (codigo: string, descricao: string, extra: Partial<FichaFiscal> = {}): FichaFiscal => ({
  codigo, descricao,
  ncm: '87116000', cest: '2600101', cfopEntrada: '6403', unidade: 'UN',
  origem: '1', cstIcmsEntrada: '10', cstPis: '01', cstCofins: '01',
  classTribIbsCbs: '000001',
  ...extra,
})

// Códigos reais das notas: a LAIOUNS prefixa com "MT-", a Q.P.A usa ora "MT-X12 10",
// ora "X12 MOTO CHEFE". O infCpl, de onde sai o modelo da moto, traz só "X12".
test('casa a moto com a ficha do mesmo modelo apesar do prefixo MT-', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'X12', chassi: 'ABC1234567890' }],
    [ficha('MT-X12-10', 'MOTOCICLETA ELETRICA MODELO X12-10')],
  )
  assert.equal(mapa.get('ABC1234567890')?.codigo, 'MT-X12-10')
})

test('casa com o sufixo comercial da Q.P.A ("X12 MOTO CHEFE")', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'X12', chassi: 'C1' }],
    [ficha('X12 MOTO CHEFE', 'X12 MOTO CHEFE', { cest: '2600100', origem: '4', cstIcmsEntrada: '60' })],
  )
  assert.equal(mapa.get('C1')?.origem, '4')
})

test('nota com dois modelos: cada chassi pega a ficha certa', () => {
  const mapa = ligarFichasAosChassis(
    [
      { modelo: 'GIGA', chassi: 'G1' },
      { modelo: 'JETMAX', chassi: 'J1' },
      { modelo: 'GIGA', chassi: 'G2' },
    ],
    [ficha('MT-GIGA', 'MOTO ELETRICA TIPO SCOOTER GIGA'), ficha('MT-JETMAX', 'MOTO ELETRICA TIPO SCOOTER JETMAX')],
  )
  assert.equal(mapa.get('G1')?.codigo, 'MT-GIGA')
  assert.equal(mapa.get('G2')?.codigo, 'MT-GIGA')
  assert.equal(mapa.get('J1')?.codigo, 'MT-JETMAX')
})

test('JET e JETMAX não se confundem — vence o código mais específico', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'JETMAX', chassi: 'J1' }, { modelo: 'JET', chassi: 'J2' }],
    [ficha('MT-JET', 'MOTO ELETRICA JET'), ficha('MT-JETMAX', 'MOTO ELETRICA TIPO SCOOTER JETMAX')],
  )
  assert.equal(mapa.get('J1')?.codigo, 'MT-JETMAX')
  assert.equal(mapa.get('J2')?.codigo, 'MT-JET')
})

test('X11 MINI não cai em X11-12 nem vice-versa', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'X11 MINI', chassi: 'A1' }],
    [ficha('MT-X11-MINI', 'SCOOTER ELETR. X11 MINI'), ficha('MT-X12-10', 'MOTOCICLETA ELETRICA MODELO X12-10')],
  )
  assert.equal(mapa.get('A1')?.codigo, 'MT-X11-MINI')
})

test('nota com um único item: todas as motos usam a mesma ficha, mesmo sem casar o nome', () => {
  // Real: a LAIOUNS emitiu "MOTOCICLETA ELETRICA TIPO MOTONETA" para X12.
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'X12', chassi: 'A1' }, { modelo: 'X12', chassi: 'A2' }],
    [ficha('ITEM-UNICO', 'MOTOCICLETA ELETRICA TIPO MOTONETA')],
  )
  assert.equal(mapa.size, 2)
  assert.equal(mapa.get('A2')?.codigo, 'ITEM-UNICO')
})

test('sem casar e com várias fichas, não adivinha: chassi fica de fora', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'RAPTOR', chassi: 'R1' }],
    [ficha('MT-GIGA', 'GIGA'), ficha('MT-JET', 'JET')],
  )
  assert.equal(mapa.size, 0)
})

test('item que não é moto (guarda-sol, peças) não entra como ficha única', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'GIGA', chassi: 'G1' }],
    [
      ficha('MT-GIGA', 'MOTO ELETRICA TIPO SCOOTER GIGA'),
      ficha('G-SOL', 'GUARDA SOL', { ncm: '66019900' }),
    ],
  )
  assert.equal(mapa.get('G1')?.codigo, 'MT-GIGA')
})

test('lista vazia dos dois lados não quebra', () => {
  assert.equal(ligarFichasAosChassis([], []).size, 0)
  assert.equal(ligarFichasAosChassis([{ modelo: 'X', chassi: 'C' }], []).size, 0)
})

// ─── casos reais que falharam no backfill de 24/09 ──────────────────────────
// O catálogo entra como terceiro argumento: é ele que diz que "X12-1000W" do
// infCpl e "X12 MOTO CHEFE" do item são o mesmo X12.
const CATALOGO = ['X12', 'BOB', 'JET', 'JETMAX', 'GIGA', 'PATINETE G5', 'DRIFT CAR', 'MIA TRI', 'X11 MINI']

test('NF 306: "X12-1000W" no infCpl casa com o item "X12 MOTO CHEFE"', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'X12-1000W', chassi: 'MCBRX122602110052' }],
    [
      ficha('BOB MOTO CHEFE', 'BOB MOTO CHEFE'),
      ficha('JET MOTO CHEFE', 'JET MOTO CHEFE'),
      ficha('X12 MOTO CHEFE', 'X12 MOTO CHEFE', { cest: '2600100', origem: '4', cstIcmsEntrada: '60' }),
    ],
    CATALOGO,
  )
  assert.equal(mapa.get('MCBRX122602110052')?.codigo, 'X12 MOTO CHEFE')
})

test('NF 306: "BOB MC" casa com "BOB MOTO CHEFE" e não com JET', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'BOB MC', chassi: 'B1' }],
    [ficha('BOB MOTO CHEFE', 'BOB MOTO CHEFE'), ficha('JET MOTO CHEFE', 'JET MOTO CHEFE')],
    CATALOGO,
  )
  assert.equal(mapa.get('B1')?.codigo, 'BOB MOTO CHEFE')
})

test('a potência não faz JET virar JETMAX', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'JET 1000W', chassi: 'J1' }, { modelo: 'JET MAX 1000W', chassi: 'J2' }],
    [ficha('MT-JET', 'MOTO ELETRICA JET'), ficha('MT-JETMAX', 'MOTO ELETRICA TIPO SCOOTER JETMAX')],
    CATALOGO,
  )
  assert.equal(mapa.get('J1')?.codigo, 'MT-JET')
  assert.equal(mapa.get('J2')?.codigo, 'MT-JETMAX')
})

test('sem catálogo continua funcionando como antes', () => {
  const mapa = ligarFichasAosChassis(
    [{ modelo: 'GIGA', chassi: 'G1' }],
    [ficha('MT-GIGA', 'MOTO ELETRICA TIPO SCOOTER GIGA')],
  )
  assert.equal(mapa.get('G1')?.codigo, 'MT-GIGA')
})
