import { test } from 'node:test'
import assert from 'node:assert/strict'
import { escolherUsuarios, mascararEmail, motivoRecusaMatrizLocal, type Candidato } from './matriz-local'

const ALVO = {
  databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:54322/postgres',
  supabaseUrl: 'http://127.0.0.1:54321',
  baseUrl: 'http://localhost:3600',
}

test('aceita só a cópia local: banco 54322, Supabase 54321 e app em localhost', () => {
  assert.equal(motivoRecusaMatrizLocal(ALVO), null)
  assert.equal(motivoRecusaMatrizLocal({ ...ALVO, databaseUrl: 'postgresql://postgres.bzlaradpofaecqzawyym:x@aws-0-sa-east-1.pooler.supabase.com:6543/postgres' }),
    'o banco não é a cópia local (aws-0-sa-east-1.pooler.supabase.com:6543)')
  assert.equal(motivoRecusaMatrizLocal({ ...ALVO, databaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5432/postgres' }),
    'o banco não é a cópia local (127.0.0.1:5432)')
  assert.equal(motivoRecusaMatrizLocal({ ...ALVO, supabaseUrl: 'https://pulsqeymzsheasxsdnnk.supabase.co' }),
    'o Supabase não é o da cópia local (pulsqeymzsheasxsdnnk.supabase.co)')
  assert.equal(motivoRecusaMatrizLocal({ ...ALVO, baseUrl: 'https://dev.meumova.com' }),
    'o app não está em localhost (dev.meumova.com)')
})

test('a recusa não repete a senha do banco', () => {
  const r = motivoRecusaMatrizLocal({ ...ALVO, databaseUrl: 'postgresql://postgres:segredo123@db.x.supabase.co:5432/postgres' })
  assert.ok(r && !r.includes('segredo123'), r ?? '')
})

test('falta variável: recusa dizendo qual', () => {
  assert.equal(motivoRecusaMatrizLocal({ ...ALVO, databaseUrl: undefined }), 'falta DATABASE_URL (rode com o .env.localprod)')
})

const c = (extra: Partial<Candidato>): Candidato => ({
  id: 'u1', email: 'joao@loja.com', papel: 'vendedor', papeisExtras: [], modulosExtras: [],
  modulosBloqueados: [], temDados: true, temLoja: true, ...extra,
})

test('um usuário por papel, na ordem da matriz, o primeiro da lista que serve', () => {
  const { escolhidos, semCandidato } = escolherUsuarios([
    c({ id: 'v1', email: 'v1@a.com' }),
    c({ id: 'v2', email: 'v2@a.com' }),
    c({ id: 'g1', email: 'g1@a.com', papel: 'admin_geral', temDados: false, temLoja: false }),
  ])
  assert.deepEqual(escolhidos.map(e => [e.papel, e.id]), [['admin_geral', 'g1'], ['vendedor', 'v1']])
  assert.deepEqual(semCandidato, ['admin_socio', 'aux_adm', 'mecanico', 'motorista'])
})

test('pula quem tem exceção de acesso, porque o esperado vem só do papel', () => {
  for (const extra of [{ papeisExtras: ['vendedor'] }, { modulosExtras: ['entrada'] }, { modulosBloqueados: ['vendas'] }]) {
    assert.deepEqual(escolherUsuarios([c(extra)]).escolhidos, [], JSON.stringify(extra))
  }
})

test('fora o admin_geral, pula quem cairia no completar cadastro ou não tem loja', () => {
  assert.deepEqual(escolherUsuarios([c({ temDados: false })]).escolhidos, [])
  assert.deepEqual(escolherUsuarios([c({ temLoja: false })]).escolhidos, [])
})

test('o rótulo mascara o e-mail', () => {
  assert.equal(mascararEmail('joao.silva@loja.com.br'), 'jo***@loja.com.br')
  assert.equal(mascararEmail('a@b.com'), 'a***@b.com')
  assert.equal(escolherUsuarios([c({})]).escolhidos[0].rotulo, 'jo***@loja.com')
})
