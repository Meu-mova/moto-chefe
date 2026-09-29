import { test } from 'node:test'
import assert from 'node:assert/strict'
import { observacoesVendaMoto, TEXTO_GARANTIA } from './nfe-observacoes'

const base = {
  marca: 'MOTO CHEFE',
  modeloNome: 'X12',
  chassi: 'HL5TCAH33S9W66988',
  motor: 'M123',
  tipoMotor: 'Hub',
  categoria: 'autopropelido',
  potencia: '1000',
  cor: 'PRETA',
}

test('garantia primeiro, ficha do veículo depois, linha por campo', () => {
  assert.equal(
    observacoesVendaMoto(base),
    `${TEXTO_GARANTIA}\n\nMarca: MOTO CHEFE\nModelo: X12\nChassi: HL5TCAH33S9W66988\nMotor: M123\n` +
      'Categoria: autopropelido\nPotência: 1000\nCor: PRETA',
  )
})

test('sem número de motor, usa o tipo de motor do modelo', () => {
  assert.match(observacoesVendaMoto({ ...base, motor: null }), /\nMotor: Hub\n/)
})

test('campo vazio ou em branco vira N/I', () => {
  const t = observacoesVendaMoto({ ...base, motor: null, tipoMotor: '', cor: '  ', potencia: null })
  assert.match(t, /\nMotor: N\/I\n/)
  assert.match(t, /\nPotência: N\/I\n/)
  assert.match(t, /\nCor: N\/I$/)
})
