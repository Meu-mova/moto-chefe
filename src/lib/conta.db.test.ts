// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/efetivar-pedido.db.test.ts.
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
type Conta = typeof import('@/lib/conta')
let db: Db['db']
let grupoEstaNaConta: Conta['grupoEstaNaConta']
let listarLojasAtivasDaConta: Conta['listarLojasAtivasDaConta']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ grupoEstaNaConta, listarLojasAtivasDaConta } = await import('@/lib/conta'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})


class Desfazer extends Error {}

test('grupo e lojas de uma Conta: nada de outra Conta entra', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const conta = await linha(sql`insert into contas (nome) values ('Conta do dono') returning id`)
    const outra = await linha(sql`insert into contas (nome) values ('Outro cliente') returning id`)
    const sul = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Sul', '00000000000191', ${conta.id}) returning id`)
    const bh = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('BH', '00000000000272', ${conta.id}) returning id`)
    const x = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('X', '00000000000353', ${outra.id}) returning id`)
    await tx.execute(sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Sul Centro', 'r', 'c', ${sul.id}), ('BH Centro', 'r', 'c', ${bh.id}), ('X Centro', 'r', 'c', ${x.id})`)
    await tx.execute(sql`insert into lojas (nome, endereco, cidade, grupo_id, ativa) values ('Sul Fechada', 'r', 'c', ${sul.id}, false)`)

    assert.equal(await grupoEstaNaConta(bh.id, conta.id, tx), true, 'grupo da Conta')
    assert.equal(await grupoEstaNaConta(x.id, conta.id, tx), false, 'grupo de outra Conta')
    assert.equal(await grupoEstaNaConta(sul.id, null, tx), false, 'sem Conta, nenhum grupo')
    assert.deepEqual((await listarLojasAtivasDaConta(conta.id, tx)).map(l => l.nome), ['BH Centro', 'Sul Centro'], 'lojas ativas da Conta, sem as de outra Conta')
    assert.deepEqual(await listarLojasAtivasDaConta(null, tx), [], 'sem Conta, nenhuma loja')
    throw new Desfazer()
  }), Desfazer)
})
