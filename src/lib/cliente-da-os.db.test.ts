// Teste de banco: Postgres descartável, como src/lib/cargos.db.test.ts.
// Cliente lido pela OS (#450): liberado pelo módulo OS, só da Conta.
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
let mod: typeof import('@/lib/cliente-da-os')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/cliente-da-os')
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

async function semear(tx: Tx, nome: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'CO450 ' + nome}) returning id`)
  const [cliente] = await linhas(tx, sql`insert into clientes (nome, cpf_cnpj, conta_id)
    values (${'Cliente ' + nome}, '52998224725', ${conta.id}) returning id`)
  return { contaId: conta.id as string, clienteId: cliente.id as string }
}

test('quem tem clientes bloqueado ainda lê o cliente ao abrir a OS (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semear(tx, 'A')
    const vendedor = { papel: 'vendedor', modulosBloqueados: ['clientes'], contaId: a.contaId }
    const c = await mod.clienteDaOs(tx, vendedor, a.clienteId)
    assert.equal(c?.nome, 'Cliente A')
    assert.deepEqual(Object.keys(c ?? {}).sort(), ['celular', 'cpfCnpj', 'email', 'id', 'nome'])
  })
})

test('Conta B não lê o cliente da Conta A pela OS; mesma resposta de id inexistente (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semear(tx, 'A')
    const b = await semear(tx, 'B')
    const daB = { papel: 'aux_adm', contaId: b.contaId }
    assert.equal(await mod.clienteDaOs(tx, daB, a.clienteId), null)
    assert.equal(await mod.clienteDaOs(tx, daB, '00000000-0000-0000-0000-000000000000'), null)
    assert.equal((await mod.clienteDaOs(tx, daB, b.clienteId))?.nome, 'Cliente B')
  })
})

test('sem o módulo OS, não lê cliente pela OS (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semear(tx, 'A')
    for (const u of [{ papel: 'motorista' }, { papel: 'cargo', modulosDoCargo: ['clientes'] },
      { papel: 'vendedor', modulosBloqueados: ['ordens-servico'] }]) {
      assert.equal(await mod.clienteDaOs(tx, { ...u, contaId: a.contaId }, a.clienteId), null, u.papel)
    }
  })
})

test('busca por CPF na OS: só com o módulo OS, só da Conta, CPF inteiro (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semear(tx, 'A')
    const b = await semear(tx, 'B')
    const daA = { papel: 'vendedor', modulosBloqueados: ['clientes'], contaId: a.contaId }
    assert.equal((await mod.clientePorCpfDaOs(tx, daA, '529.982.247-25'))?.id, a.clienteId)
    // Trecho do CPF não casa mais.
    assert.equal(await mod.clientePorCpfDaOs(tx, daA, '5299822472'), null)
    assert.equal(await mod.clientePorCpfDaOs(tx, daA, '05299822472'), null)
    // B tem cliente com o mesmo CPF: cada Conta só acha o seu.
    assert.equal((await mod.clientePorCpfDaOs(tx, { papel: 'aux_adm', contaId: b.contaId }, '52998224725'))?.id, b.clienteId)
    for (const u of [{ papel: 'motorista' }, { papel: 'cargo', modulosDoCargo: ['clientes'] }]) {
      assert.equal(await mod.clientePorCpfDaOs(tx, { ...u, contaId: a.contaId }, '52998224725'), null, u.papel)
    }
  })
})

test('busca por CPF na OS: Conta B não acha cliente que só existe na A (#450)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semear(tx, 'A')
    // Gravado com máscara: a busca compara só os dígitos dos dois lados.
    await linhas(tx, sql`insert into clientes (nome, cpf_cnpj, conta_id) values ('Só A', '123.456.789-09', ${a.contaId})`)
    const [contaB] = await linhas(tx, sql`insert into contas (nome) values ('CO450 B') returning id`)
    assert.equal((await mod.clientePorCpfDaOs(tx, { papel: 'admin_socio', contaId: a.contaId }, '12345678909'))?.nome, 'Só A')
    assert.equal(await mod.clientePorCpfDaOs(tx, { papel: 'admin_socio', contaId: contaB.id }, '12345678909'), null)
  })
})
