import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mascaraCelular, mascaraCep } from './mascaras'

test('celular descarta letras e formata enquanto digita', () => {
  assert.equal(mascaraCelular('abc'), '')
  assert.equal(mascaraCelular('3'), '3')
  assert.equal(mascaraCelular('359'), '(35) 9')
  assert.equal(mascaraCelular('35a9999x9'), '(35) 99999')
  assert.equal(mascaraCelular('35999998888'), '(35) 99999-8888')
  assert.equal(mascaraCelular('(35) 99999-88881234'), '(35) 99999-8888')
})

test('CEP descarta letras e formata com hífen', () => {
  assert.equal(mascaraCep('37a500'), '37500')
  assert.equal(mascaraCep('375000'), '37500-0')
  assert.equal(mascaraCep('37500-00099'), '37500-000')
})
