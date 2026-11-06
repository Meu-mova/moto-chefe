import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ehUuid } from './uuid'

test('aceita UUID em maiúscula ou minúscula', () => {
  assert.equal(ehUuid('0f8fad5b-d9cb-469f-a165-70867728950e'), true)
  assert.equal(ehUuid('0F8FAD5B-D9CB-469F-A165-70867728950E'), true)
})

test('recusa texto que não é UUID, inclusive com sobra', () => {
  for (const s of ['', 'abc', '0f8fad5b-d9cb-469f-a165-70867728950', ' 0f8fad5b-d9cb-469f-a165-70867728950e', "x' or 1=1"]) assert.equal(ehUuid(s), false, s)
})
