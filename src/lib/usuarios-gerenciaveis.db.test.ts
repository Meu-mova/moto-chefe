// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
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
type Mod = typeof import('@/lib/usuarios-gerenciaveis')
let db: Db['db']
let listarUsuariosGerenciaveis: Mod['listarUsuariosGerenciaveis']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarUsuariosGerenciaveis } = await import('@/lib/usuarios-gerenciaveis'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('sócio lista só usuários de loja de grupo que ele vê; admin_geral lista todos', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Conta A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Conta B') returning id`)
    const grupoA1 = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('A1', '00000000000191', ${contaA.id}) returning id`)
    const grupoA2 = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('A2', '00000000000272', ${contaA.id}) returning id`)
    const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('B', '00000000000353', ${contaB.id}) returning id`)
    const loja = async (nome: string, grupoId: string) =>
      linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values (${nome}, 'Rua', 'X', ${grupoId}) returning id`)
    const lojaA1 = await loja('Loja A1', grupoA1.id)
    const lojaA2 = await loja('Loja A2', grupoA2.id)
    const lojaB = await loja('Loja B', grupoB.id)
    const usuario = async (email: string, papel: string, lojaId: string | null, contaId: string | null, gruposAcesso: string[] = []) =>
      linha(sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id, grupos_acesso)
                values (gen_random_uuid(), ${email}, ${email}, ${papel}::papel, ${lojaId}, ${contaId}, ${sql.param(gruposAcesso)}::uuid[]) returning id`)
    await usuario('vend-a1@t', 'vendedor', lojaA1.id, contaA.id)
    await usuario('vend-a2@t', 'vendedor', lojaA2.id, contaA.id)
    await usuario('vend-b@t', 'vendedor', lojaB.id, contaB.id)
    await usuario('geral@t', 'admin_geral', null, null)
    await usuario('socio-a1-e-a2@t', 'admin_socio', lojaA1.id, contaA.id, [grupoA2.id])
    await usuario('socio-sem-loja-a1@t', 'admin_socio', null, contaA.id, [grupoA1.id])

    const emails = async (gestor: { papel: string; gruposVisiveis: string[] }) =>
      (await listarUsuariosGerenciaveis(gestor, tx)).map(u => u.email).filter(e => e.endsWith('@t')).sort()

    assert.deepEqual(await emails({ papel: 'admin_socio', gruposVisiveis: [grupoA1.id] }), ['socio-sem-loja-a1@t', 'vend-a1@t'],
      'sócio só do A1 não recebe o vendedor do A2 (mesma Conta), o da Conta B, nem o sócio que também vê o A2')
    assert.deepEqual(await emails({ papel: 'admin_socio', gruposVisiveis: [grupoB.id] }), ['vend-b@t'],
      'sócio da Conta B não recebe ninguém da Conta A')
    assert.deepEqual(await emails({ papel: 'aux_adm', gruposVisiveis: [grupoA1.id] }), [], 'aux_adm não lista ninguém')
    assert.deepEqual(await emails({ papel: 'admin_geral', gruposVisiveis: [] }),
      ['geral@t', 'socio-a1-e-a2@t', 'socio-sem-loja-a1@t', 'vend-a1@t', 'vend-a2@t', 'vend-b@t'], 'admin_geral lista todos')
    throw new Desfazer()
  }), Desfazer)
})
