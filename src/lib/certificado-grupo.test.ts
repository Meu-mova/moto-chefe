import { test } from 'node:test'
import assert from 'node:assert/strict'
import { certificateMatchesGroup } from './certificado-grupo'

const parent = '12345678000195'
const branch = '12345678000276'

test('A1 da matriz serve à filial quando o titular pertence à Conta', () => {
  assert.equal(certificateMatchesGroup(parent, branch, [parent, branch]), true)
  assert.equal(certificateMatchesGroup(parent, '12.345.678/0002-76', ['12.345.678/0001-95']), true)
})

test('raiz igual sem titular na Conta recusa; raiz diferente recusa mesmo com titular', () => {
  assert.equal(certificateMatchesGroup(parent, branch, [branch]), false)
  assert.equal(certificateMatchesGroup(parent, '99999999000191', [parent]), false)
})

test('CNPJ completo igual continua aceito', () => {
  assert.equal(certificateMatchesGroup(parent, parent, [parent]), true)
})

test('vazios e documentos incompletos não viram raízes iguais', () => {
  for (const invalid of ['', '12345678', '1234567800019']) {
    assert.equal(certificateMatchesGroup(invalid, invalid, [invalid]), false)
  }
  assert.equal(certificateMatchesGroup(parent, branch, []), false)
})
