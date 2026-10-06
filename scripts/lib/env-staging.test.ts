import { test } from 'node:test'
import assert from 'node:assert/strict'
import { montarEnvStaging } from './env-staging'

const STAGING = { DATABASE_URL: 'url-do-staging', NEXT_PUBLIC_SUPABASE_URL: 'supabase-do-staging' }

test('chave que só existe nos outros arquivos sai vazia', () => {
  const { env, anuladas } = montarEnvStaging({}, STAGING, ['MCPAI_ENDPOINT_URL', 'RESEND_API_KEY'])
  assert.equal(env.MCPAI_ENDPOINT_URL, '')
  assert.equal(env.RESEND_API_KEY, '')
  assert.deepEqual(anuladas, ['MCPAI_ENDPOINT_URL', 'RESEND_API_KEY'])
})

test('valor do staging vence o mesmo nome nos outros arquivos e não é anulado', () => {
  const { env, anuladas } = montarEnvStaging({}, STAGING, ['DATABASE_URL', 'CERT_MASTER_KEY'])
  assert.equal(env.DATABASE_URL, 'url-do-staging')
  assert.deepEqual(anuladas, ['CERT_MASTER_KEY'])
})

test('valor do staging vence o que já estava exportado no shell', () => {
  const { env } = montarEnvStaging({ DATABASE_URL: 'url-da-prod-exportada' }, STAGING, [])
  assert.equal(env.DATABASE_URL, 'url-do-staging')
})

test('variável do shell que nenhum arquivo cita passa intacta', () => {
  const { env } = montarEnvStaging({ PATH: '/usr/bin' }, STAGING, ['RESEND_API_KEY'])
  assert.equal(env.PATH, '/usr/bin')
})

test('chave repetida em mais de um arquivo aparece uma vez só', () => {
  assert.deepEqual(montarEnvStaging({}, STAGING, ['X', 'X']).anuladas, ['X'])
})
