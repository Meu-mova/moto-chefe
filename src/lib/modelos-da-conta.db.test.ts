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
type Mod = typeof import('@/lib/modelos-da-conta')
let db: Db['db']
let listarModelosDaConta: Mod['listarModelosDaConta']
let salvarMarcasDaConta: Mod['salvarMarcasDaConta']
let listarMarcasDaConta: Mod['listarMarcasDaConta']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarModelosDaConta, salvarMarcasDaConta, listarMarcasDaConta } = await import('@/lib/modelos-da-conta'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('Conta com marcas escolhidas não vê as outras; Conta sem escolha vê todas', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const eco = await linha(sql`insert into contas (nome) values ('Só MotoChefe') returning id`)
    const cesar = await linha(sql`insert into contas (nome) values ('Sem escolha') returning id`)
    await tx.execute(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values
      ('TESTE-MC', 'X12', 'autopropelido', '1000', '', ''),
      ('TESTE-VOE', 'V1', 'autopropelido', '1000', '', '')`)

    await salvarMarcasDaConta(eco.id, ['TESTE-MC', 'TESTE-MC', ' '], tx)
    assert.deepEqual(await listarMarcasDaConta(eco.id, tx), ['TESTE-MC'], 'grava sem repetir nem vazio')

    const daEco = (await listarModelosDaConta(eco.id, tx)).map(m => m.marca)
    assert.ok(daEco.includes('TESTE-MC') && !daEco.includes('TESTE-VOE'), 'só a marca escolhida')
    assert.ok(daEco.every(m => m === 'TESTE-MC'), 'nenhuma outra marca da plataforma')

    const doCesar = (await listarModelosDaConta(cesar.id, tx)).map(m => m.marca)
    assert.ok(doCesar.includes('TESTE-MC') && doCesar.includes('TESTE-VOE'), 'sem escolha, todas')

    await salvarMarcasDaConta(eco.id, [], tx)
    assert.ok((await listarModelosDaConta(eco.id, tx)).some(m => m.marca === 'TESTE-VOE'), 'limpar a escolha volta a ver todas')
    throw new Desfazer()
  }), Desfazer)
})
