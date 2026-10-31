// Teste de banco: Postgres descartável, como src/lib/transferencia-grupos.db.test.ts.
// Grupo que emite a NF de saída (#552).
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
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let mod: typeof import('@/lib/notagateway/grupo-emissor')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/notagateway/grupo-emissor')
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows

async function semearConta(tx: Tx, nome: string, ligada: boolean) {
  const [conta] = await linhas(tx, sql`insert into contas (nome, transferencia_entre_grupos) values (${'GE552 ' + nome}, ${ligada}) returning id`)
  const grupo = async (sufixo: string) => {
    const [g] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'GE552 ' + nome + sufixo}, '00000000000000', ${conta.id}) returning id`)
    const [l] = await linhas(tx, sql`insert into lojas (nome, endereco, cidade, grupo_id) values (${'Loja ' + nome + sufixo}, 'Rua 1', 'X', ${g.id}) returning id`)
    return { grupoId: g.id as string, lojaId: l.id as string }
  }
  return { contaId: conta.id as string, g1: await grupo('1'), g2: await grupo('2') }
}

/** Moto que entrou na loja `entrada` e está agora na loja `atual`. */
async function moto(tx: Tx, entradaLojaId: string, atualLojaId: string) {
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'GE552', 'autopropelido', '1000', 'hub', '32') returning id`)
  const [m] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada)
    values (${'GE552' + Math.floor(Math.random() * 1e9)}, ${modelo.id}, ${entradaLojaId}, 'Preta', '1') returning id`)
  await linhas(tx, sql`update motos set loja_id = ${atualLojaId} where id = ${m.id}`)
  return m.id as string
}

test('chave ligada: emite pelo grupo que comprou a moto', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', true)
    const m = await moto(tx, a.g1.lojaId, a.g2.lojaId)
    const e = await mod.grupoEmissorDaVenda(m, a.g2.lojaId, tx)
    assert.equal(e?.grupoId, a.g1.grupoId)
    assert.equal(e?.grupoDaLojaId, a.g2.grupoId)
    assert.equal(e?.outroCnpj, true)
    assert.equal(e?.nome, 'GE552 A1')
  })
})

test('chave desligada: emite pelo grupo da loja, como hoje', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', false)
    const m = await moto(tx, a.g1.lojaId, a.g2.lojaId)
    const e = await mod.grupoEmissorDaVenda(m, a.g2.lojaId, tx)
    assert.equal(e?.grupoId, a.g2.grupoId)
    assert.equal(e?.outroCnpj, false)
  })
})

test('moto vendida na loja onde entrou: mesmo grupo, sem outro CNPJ', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', true)
    const m = await moto(tx, a.g1.lojaId, a.g1.lojaId)
    const e = await mod.grupoEmissorDaVenda(m, a.g1.lojaId, tx)
    assert.equal(e?.grupoId, a.g1.grupoId)
    assert.equal(e?.outroCnpj, false)
  })
})

test('grupo de entrada em outra Conta nunca emite: volta ao grupo da loja (A×B)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', true)
    const b = await semearConta(tx, 'B', true)
    // Moto que entrou na Conta A e está numa loja da Conta B (ex.: grupo movido de Conta).
    const m = await moto(tx, a.g1.lojaId, b.g1.lojaId)
    const e = await mod.grupoEmissorDaVenda(m, b.g1.lojaId, tx)
    assert.equal(e?.grupoId, b.g1.grupoId)
    assert.equal(e?.outroCnpj, false)
    assert.notEqual(e?.nome, 'GE552 A1')
  })
})

test('grupo de entrada movido para outra Conta depois: volta ao grupo da loja', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', true)
    const b = await semearConta(tx, 'B', true)
    const m = await moto(tx, a.g1.lojaId, a.g2.lojaId)
    await linhas(tx, sql`update grupos set conta_id = ${b.contaId} where id = ${a.g1.grupoId}`)
    const e = await mod.grupoEmissorDaVenda(m, a.g2.lojaId, tx)
    assert.equal(e?.grupoId, a.g2.grupoId)
  })
})

test('a chave da Conta B ligada não vale para venda da Conta A', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', false)
    await semearConta(tx, 'B', true)
    const m = await moto(tx, a.g1.lojaId, a.g2.lojaId)
    assert.equal((await mod.grupoEmissorDaVenda(m, a.g2.lojaId, tx))?.grupoId, a.g2.grupoId)
  })
})

test('faltas para emitir: A1 vencido e sem empresa na Nota Gateway', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', true)
    assert.deepEqual(await mod.faltasParaEmitir(a.g1.grupoId, tx), ['sem certificado A1 válido', 'sem empresa na Nota Gateway'])
    await linhas(tx, sql`insert into certificados_digitais (grupo_id, arquivo, senha, cnpj, titular, uf, valido_ate)
      values (${a.g1.grupoId}, 'x', 'x', '0', 'T', 'MG', now() - interval '1 day')`)
    await linhas(tx, sql`insert into notagateway_config (grupo_id, token) values (${a.g1.grupoId}, 'x')`)
    assert.deepEqual(await mod.faltasParaEmitir(a.g1.grupoId, tx), ['sem certificado A1 válido', 'sem empresa na Nota Gateway'])
    await linhas(tx, sql`update certificados_digitais set valido_ate = now() + interval '30 days' where grupo_id = ${a.g1.grupoId}`)
    await linhas(tx, sql`update notagateway_config set empresa_id = 'e' where grupo_id = ${a.g1.grupoId}`)
    assert.deepEqual(await mod.faltasParaEmitir(a.g1.grupoId, tx), [])
    assert.deepEqual(await mod.faltasParaEmitir(a.g2.grupoId, tx), ['sem certificado A1 válido', 'sem empresa na Nota Gateway'], 'o pronto de um grupo não vale para outro')
  })
})
