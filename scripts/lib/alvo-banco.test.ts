import { test } from 'node:test'
import assert from 'node:assert/strict'
import { descreverAlvo, motivoRecusaProducao, REF_PRODUCAO } from './alvo-banco'

const POOLER_PROD = `postgresql://postgres.${REF_PRODUCAO}:s3nh%40x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres`
const POOLER_STAGING = 'postgresql://postgres.pulsqeymzsheasxsdnnk:s3nh@aws-0-sa-east-1.pooler.supabase.com:5432/postgres'
const DIRETA_PROD = `postgresql://postgres:s3nh@db.${REF_PRODUCAO}.supabase.co:5432/postgres`

test('pooler da produção é reconhecido como produção', () => {
  assert.equal(descreverAlvo(POOLER_PROD).ehProducao, true)
})

test('conexão direta da produção é reconhecida como produção', () => {
  assert.equal(descreverAlvo(DIRETA_PROD).ehProducao, true)
})

test('staging não é produção', () => {
  const alvo = descreverAlvo(POOLER_STAGING)
  assert.equal(alvo.ehProducao, false)
  assert.equal(alvo.ref, 'pulsqeymzsheasxsdnnk')
})

test('host desconhecido é tratado como produção', () => {
  assert.equal(descreverAlvo('postgresql://postgres:x@localhost:5432/postgres').ehProducao, true)
})

test('a descrição do alvo não carrega a senha', () => {
  assert.doesNotMatch(JSON.stringify(descreverAlvo(POOLER_STAGING)), /s3nh/)
})

test('URL inválida falha sem ecoar o conteúdo', () => {
  assert.throws(() => descreverAlvo('s3nh-solta'), (e: Error) => !e.message.includes('s3nh'))
})

test('produção sem --prod é recusada; com --prod segue', () => {
  const alvo = descreverAlvo(DIRETA_PROD)
  assert.notEqual(motivoRecusaProducao(alvo, false), null)
  assert.equal(motivoRecusaProducao(alvo, true), null)
})

test('staging não pede --prod', () => {
  assert.equal(motivoRecusaProducao(descreverAlvo(POOLER_STAGING), false), null)
})
