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
let carregarTelaModelos: typeof import('@/lib/modelos-tela')['carregarTelaModelos']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarModelosDaConta, salvarMarcasDaConta, listarMarcasDaConta } = await import('@/lib/modelos-da-conta'))
  ;({ carregarTelaModelos } = await import('@/lib/modelos-tela'))
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

test('sócio vê só os modelos das marcas da sua Conta e não recebe a lista de Contas (#320)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Grupo B', '00000000000191', ${contaB.id}) returning id`)
    await tx.execute(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values
      ('TESTE-MC', 'X12', 'autopropelido', '1000', '', ''),
      ('TESTE-VOE', 'V1', 'autopropelido', '1000', '', '')`)
    await salvarMarcasDaConta(contaB.id, ['TESTE-MC'], tx)

    const socio = await carregarTelaModelos({ adminGeral: false, contaId: contaB.id, grupoId: grupoB.id }, tx)
    assert.ok(socio.modelos.every(m => m.marca === 'TESTE-MC'), 'nenhum modelo de marca fora da Conta')
    assert.equal(socio.contas, null, 'sem a lista de Contas')

    const geral = await carregarTelaModelos({ adminGeral: true, contaId: null, grupoId: grupoB.id }, tx)
    const nomes = geral.contas?.map(c => c.nome) ?? []
    assert.ok(nomes.includes('Conta A') && nomes.includes('Conta B'), 'admin_geral vê todas as Contas')
    assert.ok(geral.modelos.some(m => m.marca === 'TESTE-VOE'), 'admin_geral vê todos os modelos')
    throw new Desfazer()
  }), Desfazer)
})
