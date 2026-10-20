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
type Usuarios = typeof import('@/lib/usuarios-do-grupo')
let db: Db['db']
let listarUsuariosDoGrupo: Usuarios['listarUsuariosDoGrupo']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarUsuariosDoGrupo } = await import('@/lib/usuarios-do-grupo'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('listas de usuários da tela trazem só quem é do grupo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const grupoA = await linha(sql`insert into grupos (nome, cnpj) values ('Grupo A', '00000000000191') returning id`)
    const grupoB = await linha(sql`insert into grupos (nome, cnpj) values ('Grupo B', '00000000000272') returning id`)
    const lojaA = await linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Loja A', 'Rua 1', 'X', ${grupoA.id}) returning id`)
    const lojaB = await linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Loja B', 'Rua 2', 'Y', ${grupoB.id}) returning id`)
    const usuario = (nome: string, papel: string, lojaId: string | null, extras: string[] = [], acesso: string[] = []) =>
      tx.execute(sql`insert into usuarios (id, nome, email, papel, loja_id, papeis_extras, grupos_acesso)
        values (gen_random_uuid(), ${nome}, ${nome + '@teste.invalid'}, ${papel}, ${lojaId}, ${sql.param(extras)}::text[], ${sql.param(acesso)}::uuid[])`)
    await usuario('Mecânico A', 'mecanico', lojaA.id)
    await usuario('Mecânico B', 'mecanico', lojaB.id)
    await usuario('Vendedor A', 'vendedor', lojaA.id)
    await usuario('Vendedor B', 'vendedor', lojaB.id)
    await usuario('Aux que vende A', 'aux_adm', lojaA.id, ['vendedor'])
    await usuario('Sócio de B com acesso a A', 'admin_socio', lojaB.id, [], [grupoA.id])
    await usuario('Sócio só de B', 'admin_socio', lojaB.id)
    await usuario('Admin geral sem loja', 'admin_geral', null)

    const nomes = async (papel?: 'mecanico' | 'vendedor') =>
      (await listarUsuariosDoGrupo(grupoA.id, { papel }, tx)).map(u => u.nome)

    assert.deepEqual(await nomes('mecanico'), ['Mecânico A'], 'mecânicos: só os de loja do grupo A')
    assert.deepEqual(await nomes('vendedor'), ['Aux que vende A', 'Vendedor A'], 'vendedores: do grupo A, inclusive quem vende como papel extra')
    assert.deepEqual(
      await nomes(),
      ['Aux que vende A', 'Mecânico A', 'Sócio de B com acesso a A', 'Vendedor A'],
      'todos: loja do grupo A ou grupo A no grupos_acesso, em ordem de nome; admin_geral sem loja fica de fora',
    )
    throw new Desfazer()
  }), Desfazer)
})
