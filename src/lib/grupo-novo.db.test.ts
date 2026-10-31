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

let db: typeof import('@/lib/db')['db']
let criarGrupo: typeof import('@/lib/grupo-novo')['criarGrupo']
let contasParaNovoGrupo: typeof import('@/lib/grupo-novo')['contasParaNovoGrupo']
let gruposVisiveis: typeof import('@/lib/acesso-grupo')['gruposVisiveis']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ criarGrupo, contasParaNovoGrupo } = await import('@/lib/grupo-novo'))
  ;({ gruposVisiveis } = await import('@/lib/acesso-grupo'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
const linha = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: Record<string, string | number>[] }).rows[0]
const dados = (nome: string, cnpj: string) => ({ nome, cnpj, ativo: true })

test('grupo na Conta existente: nasce nela, sem Conta nova nem marcas novas, e a Conta B não o vê', async () => {
  await assert.rejects(db.transaction(async tx => {
    const a = await linha(tx, sql`insert into contas (nome) values ('Rede A') returning id`)
    const b = await linha(tx, sql`insert into contas (nome) values ('Rede B') returning id`)
    const contas = async () => Number((await linha(tx, sql`select count(*)::int n from contas`)).n)
    const marcasA = async () => Number((await linha(tx, sql`select count(*)::int n from conta_marcas where conta_id = ${a.id}`)).n)
    const [antesContas, antesMarcas] = [await contas(), await marcasA()]

    const r = await criarGrupo(tx, dados('Filial A2', '00000000000191'), String(a.id))
    assert.equal(r.contaId, a.id)
    assert.equal((await linha(tx, sql`select conta_id from grupos where id = ${r.grupoId}`)).conta_id, a.id)
    assert.equal(await contas(), antesContas, 'nenhuma Conta nova')
    assert.equal(await marcasA(), antesMarcas, 'marcas da Conta A intactas')

    const novo = { id: r.grupoId, contaId: String(a.id) }
    assert.deepEqual(gruposVisiveis({ papel: 'admin_socio', contaId: String(b.id), gruposAcesso: [r.grupoId] }, null, [novo]), [], 'sócio da B não vê, nem marcado')
    assert.deepEqual(gruposVisiveis({ papel: 'admin_socio', contaId: String(a.id), gruposAcesso: [r.grupoId] }, null, [novo]), [r.grupoId])
    throw new Desfazer()
  }), Desfazer)
})

test('Conta desativada (grupo movido, #554) não aparece para receber grupo novo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const viva = await linha(tx, sql`insert into contas (nome) values ('Viva 199') returning id`)
    const morta = await linha(tx, sql`insert into contas (nome, desativada_em) values ('Desativada 199', now()) returning id`)
    const ids = (await contasParaNovoGrupo(tx)).map(c => c.id)
    assert.ok(ids.includes(String(viva.id)))
    assert.ok(!ids.includes(String(morta.id)))
    // Postado direto, sem passar pela lista: recusado do mesmo jeito.
    await assert.rejects(tx.transaction(sp => criarGrupo(sp, dados('Na desativada', '00000000000515'), String(morta.id))), /Conta não encontrada/)
    assert.equal(Number((await linha(tx, sql`select count(*)::int n from grupos where conta_id = ${morta.id}`)).n), 0)
    throw new Desfazer()
  }), Desfazer)
})

test('Conta nova (padrão): cria a Conta com as marcas; Conta inexistente é recusada sem gravar', async () => {
  await assert.rejects(db.transaction(async tx => {
    const r = await criarGrupo(tx, dados('Loja Nova', '00000000000272'), null)
    assert.equal((await linha(tx, sql`select nome from contas where id = ${r.contaId}`)).nome, 'Loja Nova')
    assert.ok(Number((await linha(tx, sql`select count(*)::int n from conta_marcas where conta_id = ${r.contaId}`)).n) > 0)

    const antes = Number((await linha(tx, sql`select count(*)::int n from grupos`)).n)
    await assert.rejects(tx.transaction(sp => criarGrupo(sp, dados('Fantasma', '00000000000353'), '00000000-0000-0000-0000-000000000000')), /Conta não encontrada/)
    await assert.rejects(tx.transaction(sp => criarGrupo(sp, dados('Fantasma', '00000000000353'), 'nao-e-uuid')), /Conta não encontrada/)
    assert.equal(Number((await linha(tx, sql`select count(*)::int n from grupos`)).n), antes)
    throw new Desfazer()
  }), Desfazer)
})
