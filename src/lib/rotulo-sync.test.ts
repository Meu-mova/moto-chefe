import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotuloSyncBrt } from './rotulo-sync'

test('rotuloSyncBrt: mostra o horário de Brasília, não o UTC', () => {
  assert.equal(rotuloSyncBrt(new Date('2026-10-15T00:59:00.000Z')), 'Sincronizado em 14/10, 21:59')
})

test('rotuloSyncBrt: meio-dia UTC é 09h em Brasília', () => {
  assert.equal(rotuloSyncBrt(new Date('2026-10-15T12:00:00.000Z')), 'Sincronizado em 15/10, 09:00')
})
