// Teste de banco (#904): roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: `npm run test:db:local`. Cada caso grava numa transação desfeita no fim.
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
type Mod = typeof import('@/lib/difal-correcoes')
type Puro = typeof import('@/lib/notagateway/difal-ufs')
let db: Db['db']
let salvarCorrecaoUf: Mod['salvarCorrecaoUf']
let voltarAoPadraoUf: Mod['voltarAoPadraoUf']
let correcoesDosGrupos: Mod['correcoesDosGrupos']
let numerosDifalDaUf: Puro['numerosDifalDaUf']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ salvarCorrecaoUf, voltarAoPadraoUf, correcoesDosGrupos } = await import('@/lib/difal-correcoes'))
  ;({ numerosDifalDaUf } = await import('@/lib/notagateway/difal-ufs'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]

async function emTransacao(corpo: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await corpo(tx); throw new Desfazer() }), Desfazer)
}

async function cenario(tx: Tx) {
  const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  const contaA = await linha(sql`insert into contas (nome) values ('Conta A difal') returning id`)
  const contaB = await linha(sql`insert into contas (nome) values ('Conta B difal') returning id`)
  const grupoA = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Grupo A difal', '00000000000191', ${contaA.id}) returning id`)
  const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Grupo B difal', '00000000000272', ${contaB.id}) returning id`)
  const usuario = async (nome: string, papel: string, contaId: string, grupo: string) => {
    const u = await linha(sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), ${nome}, ${nome + '@difal.t'}, ${papel}, ${contaId}) returning id`)
    return { id: u.id, papel, contaId, lojaId: null, gruposAcesso: [grupo] }
  }
  return {
    grupoA: grupoA.id, grupoB: grupoB.id,
    socioA: await usuario('socioA', 'admin_socio', contaA.id, grupoA.id),
    socioB: await usuario('socioB', 'admin_socio', contaB.id, grupoB.id),
    auxA: await usuario('auxA', 'aux_adm', contaA.id, grupoA.id),
  }
}

const rj = { uf: 'RJ', aliquotaInterna: 20, fcp: 2, base: 'unica' as const }

test('D1: o sócio corrige RJ no grupo dele e a correção vale para o grupo', async () => {
  await emTransacao(async tx => {
    const c = await cenario(tx)
    assert.deepEqual(await salvarCorrecaoUf(c.socioA, { grupoId: c.grupoA, ...rj }, tx), { ok: true })
    const doA = await correcoesDosGrupos([c.grupoA], tx)
    assert.equal(numerosDifalDaUf('RJ', doA)?.aliquotaInterna, 20)
    assert.equal(numerosDifalDaUf('RJ', doA)?.origem, 'corrigido')
    // Corrigir de novo atualiza a mesma linha.
    assert.deepEqual(await salvarCorrecaoUf(c.socioA, { grupoId: c.grupoA, ...rj, aliquotaInterna: 19.5 }, tx), { ok: true })
    assert.deepEqual((await correcoesDosGrupos([c.grupoA], tx)).map(x => x.aliquotaInterna), [19.5])
  })
})

test('D2: a correção da Conta A não aparece nem vale para a Conta B', async () => {
  await emTransacao(async tx => {
    const c = await cenario(tx)
    await salvarCorrecaoUf(c.socioA, { grupoId: c.grupoA, ...rj }, tx)
    const doB = await correcoesDosGrupos([c.grupoB], tx)
    assert.deepEqual(doB, [])
    assert.equal(numerosDifalDaUf('RJ', doB)?.origem, 'padrao')
    assert.equal(numerosDifalDaUf('RJ', doB)?.aliquotaInterna, null)
  })
})

test('D3: o sócio da Conta B não corrige nem volta ao padrão no grupo da Conta A', async () => {
  await emTransacao(async tx => {
    const c = await cenario(tx)
    await salvarCorrecaoUf(c.socioA, { grupoId: c.grupoA, ...rj }, tx)
    const fora = { ok: false, erro: 'Grupo não encontrado' }
    assert.deepEqual(await salvarCorrecaoUf(c.socioB, { grupoId: c.grupoA, ...rj, aliquotaInterna: 1 }, tx), fora)
    assert.deepEqual(await voltarAoPadraoUf(c.socioB, { grupoId: c.grupoA, uf: 'RJ' }, tx), fora)
    // Grupo inexistente recebe a mesma frase.
    assert.deepEqual(await salvarCorrecaoUf(c.socioB, { grupoId: '00000000-0000-4000-8000-0000000000ff', ...rj }, tx), fora)
    assert.deepEqual((await correcoesDosGrupos([c.grupoA], tx)).map(x => x.aliquotaInterna), [20])
  })
})

test('D4: voltar ao padrão apaga só a UF daquele grupo', async () => {
  await emTransacao(async tx => {
    const c = await cenario(tx)
    await salvarCorrecaoUf(c.socioA, { grupoId: c.grupoA, ...rj }, tx)
    await salvarCorrecaoUf(c.socioA, { grupoId: c.grupoA, ...rj, uf: 'BA' }, tx)
    await salvarCorrecaoUf(c.socioB, { grupoId: c.grupoB, ...rj }, tx)
    assert.deepEqual(await voltarAoPadraoUf(c.socioA, { grupoId: c.grupoA, uf: 'rj' }, tx), { ok: true })
    assert.deepEqual((await correcoesDosGrupos([c.grupoA], tx)).map(x => x.uf), ['BA'])
    assert.deepEqual((await correcoesDosGrupos([c.grupoB], tx)).map(x => x.uf), ['RJ'])
  })
})

test('D5: papel sem configuração fiscal é recusado', async () => {
  await emTransacao(async tx => {
    const c = await cenario(tx)
    const r = await salvarCorrecaoUf(c.auxA, { grupoId: c.grupoA, ...rj }, tx)
    assert.deepEqual(r, { ok: false, erro: 'Acesso restrito a Admin Geral e Sócio' })
    assert.deepEqual(await correcoesDosGrupos([c.grupoA], tx), [])
  })
})

test('D7: valor fora de 0 a 100, base ou UF inválida são recusados sem gravar', async () => {
  await emTransacao(async tx => {
    const c = await cenario(tx)
    const g = { grupoId: c.grupoA }
    assert.equal((await salvarCorrecaoUf(c.socioA, { ...g, ...rj, aliquotaInterna: 101 }, tx)).ok, false)
    assert.equal((await salvarCorrecaoUf(c.socioA, { ...g, ...rj, fcp: -1 }, tx)).ok, false)
    assert.equal((await salvarCorrecaoUf(c.socioA, { ...g, ...rj, base: 'tripla' as 'unica' }, tx)).ok, false)
    assert.deepEqual(await salvarCorrecaoUf(c.socioA, { ...g, ...rj, uf: 'XX' }, tx), { ok: false, erro: 'Estado inválido' })
    assert.deepEqual(await correcoesDosGrupos([c.grupoA], tx), [])
  })
})
