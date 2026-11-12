import { test } from 'node:test'
import assert from 'node:assert/strict'
import { LIMITE_OBSERVACAO_NF, observacaoDaNota, observacaoDoPayload, observacoesVendaMoto, TEXTO_GARANTIA } from './nfe-observacoes'

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

const PADRAO = 'texto padrão da garantia'

test('texto editado vale para a nota, sem os espaços das pontas', () => {
  assert.deepEqual(observacaoDaNota('  GARANTIA DE 6 MESES\nChassi X  ', PADRAO), { ok: true, texto: 'GARANTIA DE 6 MESES\nChassi X' })
})

test('sem texto editado, ou só com espaços, a nota sai com o padrão', () => {
  for (const vazio of [undefined, null, '', '   \n ']) {
    assert.deepEqual(observacaoDaNota(vazio, PADRAO), { ok: true, texto: PADRAO })
  }
})

test('texto no limite passa; um caractere acima é recusado com o tamanho na frase', () => {
  const noLimite = 'a'.repeat(LIMITE_OBSERVACAO_NF)
  assert.deepEqual(observacaoDaNota(noLimite, PADRAO), { ok: true, texto: noLimite })
  const r = observacaoDaNota(noLimite + 'b', PADRAO)
  assert.equal(r.ok, false)
  assert.match(!r.ok ? r.error : '', /4\.500 caracteres/)
})

test('lê do payload gravado o texto que foi na nota', () => {
  assert.equal(observacaoDoPayload({ informacoesAdicionais: 'editado' }), 'editado')
  for (const sem of [null, {}, { informacoesAdicionais: null }, { informacoesAdicionais: 12 }]) {
    assert.equal(observacaoDoPayload(sem), null)
  }
})
