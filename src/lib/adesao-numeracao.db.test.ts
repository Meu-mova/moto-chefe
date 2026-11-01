// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
let db: Db['db']
let corrigirNumeracaoDaAdesao: typeof import('@/lib/adesao-numeracao')['corrigirNumeracaoDaAdesao']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ corrigirNumeracaoDaAdesao } = await import('@/lib/adesao-numeracao'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
const emTransacaoDesfeita = (fn: (tx: Tx) => Promise<void>) =>
  assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
const rows = async <T>(tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: T[] }).rows

const ADMIN = '00000000-0000-4000-8000-000000000001'

async function adesao(tx: Tx, serie: string | null, ultima: string | null) {
  await tx.execute(sql`insert into usuarios (id, nome, email, papel) values (${ADMIN}, 'Admin', 'admin-588@exemplo.com', 'admin_geral') on conflict (id) do nothing`)
  const [a] = await rows<{ id: string }>(tx, sql`
    insert into adesoes_mova (loja, responsavel, celular, cnpj_arquivo_path, store_login, usuarios, nf_serie_anterior, nf_ultimo_numero)
    values ('Loja X', 'Resp', '11999990000', 'x.pdf', 'l@exemplo.com', '[]'::jsonb, ${serie}, ${ultima})
    returning id`)
  return a.id
}

test('corrige série e última nota e registra quem, antes e depois no log', async () => {
  await emTransacaoDesfeita(async tx => {
    const id = await adesao(tx, '1', '1532')
    const r = await corrigirNumeracaoDaAdesao({ adesaoId: id, usuarioId: ADMIN, entrada: { naoEmite: false, serie: '2', ultima: '1.600' } }, tx)
    assert.deepEqual(r, { ok: true, valor: { serie: '2', ultima: '1600' } })

    const [a] = await rows<{ serie: string; ultima: string; por: string }>(tx, sql`
      select nf_serie_anterior serie, nf_ultimo_numero ultima, atualizado_por por from adesoes_mova where id = ${id}`)
    assert.deepEqual(a, { serie: '2', ultima: '1600', por: ADMIN })

    const log = await rows<{ usuario_id: string; detalhe: Record<string, unknown> }>(tx, sql`
      select usuario_id, detalhe from log_acoes where tipo = 'numeracao_adesao_alterada' and detalhe->>'adesaoId' = ${id}`)
    assert.equal(log.length, 1)
    assert.equal(log[0].usuario_id, ADMIN)
    assert.deepEqual(log[0].detalhe, { adesaoId: id, loja: 'Loja X', antes: { serie: '1', ultima: '1532' }, depois: { serie: '2', ultima: '1600' } })
  })
})

test('"loja não emite" limpa os dois campos e também vai para o log', async () => {
  await emTransacaoDesfeita(async tx => {
    const id = await adesao(tx, '1', '1532')
    const r = await corrigirNumeracaoDaAdesao({ adesaoId: id, usuarioId: ADMIN, entrada: { naoEmite: true, serie: '9', ultima: '9' } }, tx)
    assert.deepEqual(r, { ok: true, valor: { serie: null, ultima: null } })
    const [a] = await rows<{ serie: string | null; ultima: string | null }>(tx, sql`select nf_serie_anterior serie, nf_ultimo_numero ultima from adesoes_mova where id = ${id}`)
    assert.deepEqual(a, { serie: null, ultima: null })
    const [n] = await rows<{ n: number }>(tx, sql`select count(*)::int n from log_acoes where tipo = 'numeracao_adesao_alterada' and detalhe->>'adesaoId' = ${id}`)
    assert.equal(n.n, 1)
  })
})

test('entrada inválida ou adesão inexistente não gravam nada', async () => {
  await emTransacaoDesfeita(async tx => {
    const id = await adesao(tx, '1', '1532')
    const r = await corrigirNumeracaoDaAdesao({ adesaoId: id, usuarioId: ADMIN, entrada: { naoEmite: false, serie: '1', ultima: '' } }, tx)
    assert.equal(r.ok, false)
    const nada = await corrigirNumeracaoDaAdesao({ adesaoId: '00000000-0000-4000-8000-000000000099', usuarioId: ADMIN, entrada: { naoEmite: true, serie: '', ultima: '' } }, tx)
    assert.deepEqual(nada, { ok: false, erro: 'Adesão não encontrada' })
    const [a] = await rows<{ ultima: string }>(tx, sql`select nf_ultimo_numero ultima from adesoes_mova where id = ${id}`)
    assert.equal(a.ultima, '1532')
    const [n] = await rows<{ n: number }>(tx, sql`select count(*)::int n from log_acoes where tipo = 'numeracao_adesao_alterada'`)
    assert.equal(n.n, 0)
  })
})
