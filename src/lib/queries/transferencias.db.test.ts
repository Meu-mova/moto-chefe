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
let listarMotosTransferiveis: typeof import('@/lib/queries/transferencias')['listarMotosTransferiveis']
let lojasDaConta: typeof import('@/lib/conta')['lojasDaConta']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarMotosTransferiveis } = await import('@/lib/queries/transferencias'))
  ;({ lojasDaConta } = await import('@/lib/conta'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('transferências: a lista de motos só traz as lojas pedidas, nunca as de outra Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Transf 328 A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Transf 328 B') returning id`)
    const grupoA = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Transf 328 A', '00000000032801', ${contaA.id}) returning id`)
    const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Transf 328 B', '00000000032802', ${contaB.id}) returning id`)
    const lojaA = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja 328 A', 'C', 'R', ${grupoA.id}) returning id`)
    const lojaB = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja 328 B', 'C', 'R', ${grupoB.id}) returning id`)
    const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-328', 'T328', 'autopropelido', '1000', '', '') returning id`)
    for (const [loja, chassi, status] of [[lojaA, 'TRANSF328A1', 'disponivel'], [lojaA, 'TRANSF328A2', 'vendida'], [lojaB, 'TRANSF328B1', 'disponivel']] as const) {
      await tx.execute(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
        values (${chassi}, ${modelo.id}, ${loja.id}, 'CINZA', '1', ${status}, 'disponivel')`)
    }

    const chassis = async (ids: string[]) => (await listarMotosTransferiveis(ids, tx)).map(m => m.chassi).sort()
    assert.deepEqual(await chassis([lojaA.id]), ['TRANSF328A1'], 'A: só a dela, e só em status transferível')
    assert.deepEqual(await chassis([lojaB.id]), ['TRANSF328B1'])
    assert.deepEqual(await chassis([]), [], 'sem loja, nada (não vira "todas")')

    const daContaA = (await tx.select({ id: sql<string>`id` }).from(lojasDaConta(contaA.id).as('l'))).map(r => r.id)
    assert.deepEqual(await chassis(daContaA), ['TRANSF328A1'], 'exceção entre grupos: só lojas da própria Conta')
    throw new Desfazer()
  }), Desfazer)
})
