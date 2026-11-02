import { test } from 'node:test'
import assert from 'node:assert/strict'
import { chaveDoCnpj } from './grupo-cnpj'

// O agente manda o CNPJ com a máscara escrita no script; o cadastro do grupo
// pode ter sido digitado de outro jeito. Comparar por dígitos faz os dois se
// encontrarem em qualquer das duas grafias.
test('máscaras diferentes do mesmo CNPJ viram a mesma chave', () => {
  assert.equal(chaveDoCnpj('57.113.017/0001-72'), '57113017000172')
  assert.equal(chaveDoCnpj('57113017000172'), '57113017000172')
  assert.equal(chaveDoCnpj(' 63.009.605 / 0001-63 '), '63009605000163')
})

test('CNPJs diferentes continuam diferentes', () => {
  assert.notEqual(chaveDoCnpj('57.113.017/0001-72'), chaveDoCnpj('63.009.605/0001-63'))
})

test('CNPJ alfanumérico vira a mesma chave em qualquer grafia (#534)', () => {
  assert.equal(chaveDoCnpj('12.abc.345/01de-35'), '12ABC34501DE35')
  assert.equal(chaveDoCnpj('12ABC34501DE35'), chaveDoCnpj('12.ABC.345/01DE-35'))
})
