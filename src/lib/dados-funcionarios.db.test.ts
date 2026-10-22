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
type Mod = typeof import('@/lib/dados-funcionarios')
let db: Db['db']
let listarDadosFuncionarios: Mod['listarDadosFuncionarios']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarDadosFuncionarios } = await import('@/lib/dados-funcionarios'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('sócio de uma Conta não recebe dado pessoal de funcionário de outra Conta (#320)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const funcA = await linha(sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), 'Func A', 'a@teste.invalid', 'vendedor', ${contaA.id}) returning id`)
    const funcB = await linha(sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), 'Func B', 'b@teste.invalid', 'vendedor', ${contaB.id}) returning id`)
    await tx.execute(sql`insert into usuarios_dados (usuario_id, cpf, pix_tipo, pix_chave, data_nascimento) values
      (${funcA.id}, '11111111111', 'cpf', '11111111111', '1990-01-01'),
      (${funcB.id}, '22222222222', 'cpf', '22222222222', '1991-01-01')`)

    const daB = await listarDadosFuncionarios(contaB.id, tx)
    assert.deepEqual(daB.map(l => l.cpf), ['22222222222'], 'só o funcionário da própria Conta')

    const todos = (await listarDadosFuncionarios(null, tx)).map(l => l.id)
    assert.ok(todos.includes(funcA.id) && todos.includes(funcB.id), 'admin_geral vê todas as Contas')
    throw new Desfazer()
  }), Desfazer)
})
