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
type Acesso = typeof import('@/lib/acesso-registro')
let db: Db['db']
let podeAbrirRegistroDaLoja: Acesso['podeAbrirRegistroDaLoja']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ podeAbrirRegistroDaLoja } = await import('@/lib/acesso-registro'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('registro de loja de outro grupo só abre para quem tem o grupo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const grupoA = await linha(sql`insert into grupos (nome, cnpj) values ('Grupo A', '00000000000191') returning id`)
    const grupoB = await linha(sql`insert into grupos (nome, cnpj) values ('Grupo B', '00000000000272') returning id`)
    const grupoInativo = await linha(sql`insert into grupos (nome, cnpj, ativo) values ('Grupo Inativo', '00000000000353', false) returning id`)
    const lojaA = await linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Loja A', 'Rua 1', 'X', ${grupoA.id}) returning id`)
    const lojaA2 = await linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Loja A2', 'Rua 3', 'X', ${grupoA.id}) returning id`)
    const lojaB = await linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Loja B', 'Rua 2', 'Y', ${grupoB.id}) returning id`)
    const lojaInativa = await linha(sql`insert into lojas (nome, endereco, cidade, grupo_id) values ('Loja Inativa', 'Rua 4', 'Z', ${grupoInativo.id}) returning id`)

    const vendedorA = { papel: 'vendedor', lojaId: lojaA.id, gruposAcesso: [] } as const
    const socioSoA = { papel: 'admin_socio', lojaId: lojaA.id, gruposAcesso: [] } as const
    const socioAeB = { papel: 'admin_socio', lojaId: lojaA.id, gruposAcesso: [grupoB.id] } as const
    const socioSemLojaComB = { papel: 'admin_socio', lojaId: null, gruposAcesso: [grupoB.id] } as const
    const socioSemNada = { papel: 'admin_socio', lojaId: null, gruposAcesso: [] } as const
    const socioComInativo = { papel: 'admin_socio', lojaId: lojaA.id, gruposAcesso: [grupoInativo.id] } as const
    const adminGeral = { papel: 'admin_geral', lojaId: null, gruposAcesso: [] } as const

    assert.equal(await podeAbrirRegistroDaLoja(vendedorA, lojaA.id, tx), true, 'vendedor abre a própria loja')
    assert.equal(await podeAbrirRegistroDaLoja(vendedorA, lojaA2.id, tx), true, 'vendedor abre outra loja do mesmo grupo')
    assert.equal(await podeAbrirRegistroDaLoja(vendedorA, lojaB.id, tx), false, 'vendedor não abre loja de outro grupo')
    assert.equal(await podeAbrirRegistroDaLoja(socioSoA, lojaB.id, tx), false, 'sócio sem o grupo B não abre loja do B')
    assert.equal(await podeAbrirRegistroDaLoja(socioAeB, lojaB.id, tx), true, 'sócio com o grupo B no grupos_acesso abre loja do B')
    assert.equal(await podeAbrirRegistroDaLoja(socioSemLojaComB, lojaA.id, tx), false, 'sócio sem loja não abre grupo fora do grupos_acesso')
    assert.equal(await podeAbrirRegistroDaLoja(socioSemNada, lojaA.id, tx), false, 'sócio sem loja e sem grupos_acesso não abre loja nenhuma')
    assert.equal(await podeAbrirRegistroDaLoja(socioComInativo, lojaInativa.id, tx), false, 'sócio não abre loja de grupo inativo, mesmo com o grupo no grupos_acesso')
    assert.equal(await podeAbrirRegistroDaLoja(adminGeral, lojaB.id, tx), true, 'admin_geral abre loja de outro grupo')
    assert.equal(await podeAbrirRegistroDaLoja(adminGeral, lojaInativa.id, tx), true, 'admin_geral abre loja de grupo inativo')
    assert.equal(
      await podeAbrirRegistroDaLoja(adminGeral, '00000000-0000-0000-0000-000000000000', tx), false,
      'loja inexistente não abre, nem para admin_geral',
    )
    throw new Desfazer()
  }), Desfazer)
})
