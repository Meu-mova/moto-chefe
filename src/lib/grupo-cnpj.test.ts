import { test } from 'node:test'
import assert from 'node:assert/strict'
import { somenteDigitos } from './grupo-cnpj'

// O agente manda o CNPJ com a máscara escrita no script; o cadastro do grupo
// pode ter sido digitado de outro jeito. Comparar por dígitos faz os dois se
// encontrarem em qualquer das duas grafias.
test('máscaras diferentes do mesmo CNPJ viram a mesma chave', () => {
  assert.equal(somenteDigitos('57.113.017/0001-72'), '57113017000172')
  assert.equal(somenteDigitos('57113017000172'), '57113017000172')
  assert.equal(somenteDigitos(' 63.009.605 / 0001-63 '), '63009605000163')
})

test('CNPJs diferentes continuam diferentes', () => {
  assert.notEqual(somenteDigitos('57.113.017/0001-72'), somenteDigitos('63.009.605/0001-63'))
})
