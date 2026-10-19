import { test } from 'node:test'
import assert from 'node:assert/strict'
import { motivoRecusa, assinarNotificacao } from './e2e-mensalidade'
import { assinaturaValida } from '../../src/lib/mercadopago/webhook'

const STAGING = { supabaseUrl: 'https://pulsqeymzsheasxsdnnk.supabase.co', databaseUrl: 'postgresql://postgres.pulsqeymzsheasxsdnnk@x/postgres' }

test('aceita preview, dev.meumova.com e localhost com env do staging', () => {
  assert.equal(motivoRecusa({ ...STAGING, url: 'https://mova-motochefe-abc123-mova-b9a1d2c8.vercel.app' }), null)
  assert.equal(motivoRecusa({ ...STAGING, url: 'https://dev.meumova.com' }), null)
  assert.equal(motivoRecusa({ ...STAGING, url: 'http://localhost:3107' }), null)
})

test('recusa a produção e env que não é do staging', () => {
  assert.match(motivoRecusa({ ...STAGING, url: 'https://moto-chefe.vercel.app' })!, /fora do staging/)
  assert.match(motivoRecusa({ ...STAGING, url: 'https://meumova.com' })!, /fora do staging/)
  assert.match(motivoRecusa({ ...STAGING, url: 'https://dev.meumova.com', databaseUrl: 'postgresql://prod@x/postgres' })!, /DATABASE_URL/)
  assert.match(motivoRecusa({ ...STAGING, url: 'https://dev.meumova.com', supabaseUrl: undefined })!, /Supabase/)
})

test('a assinatura gerada passa na validação do webhook', () => {
  const xSignature = assinarNotificacao('segredo', 'ABC1', 'req-1', '1700000000')
  assert.equal(assinaturaValida({ secret: 'segredo', xSignature, xRequestId: 'req-1', dataId: 'ABC1' }), true)
})
