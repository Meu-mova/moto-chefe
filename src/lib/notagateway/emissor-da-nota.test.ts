import { test } from 'node:test'
import assert from 'node:assert/strict'
import { configDaNotaExistente } from './emissor-da-nota'
import type { ConfigNotaGateway } from './client'

const cfg = (empresaId: string): ConfigNotaGateway => ({ token: 't', empresaId, ambiente: 'Producao' })
const emissor = { grupoId: 'entrada', cfg: cfg('E') }

test('nota do próprio emissor usa a config dele', async () => {
  assert.equal((await configDaNotaExistente('entrada', emissor, async () => { throw new Error('não consulta') })).empresaId, 'E')
})

test('nota de outro grupo da Conta usa a config do grupo da nota, não a do emissor (#552)', async () => {
  const lidos: string[] = []
  const r = await configDaNotaExistente('loja', emissor, async g => { lidos.push(g); return cfg('L') })
  assert.equal(r.empresaId, 'L')
  assert.deepEqual(lidos, ['loja'])
})

test('grupo da nota sem config: recusa em vez de seguir para uma 2ª NF', async () => {
  await assert.rejects(configDaNotaExistente('loja', emissor, async () => null), /NF anterior por outro CNPJ/)
})
