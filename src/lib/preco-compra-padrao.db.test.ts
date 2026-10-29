// Teste de banco: Postgres descartável, como src/lib/entrada-pecas.db.test.ts.
// Preço de compra padrão na entrada de motos (#513): vem só da Conta da loja de destino
// (ajuste da Conta ou modelo próprio dela), nunca da plataforma nem de outra Conta.
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
let padrao: typeof import('@/lib/preco-compra-padrao')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  padrao = await import('@/lib/preco-compra-padrao')
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

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'PC513 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'PC513 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja PC513 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const usuario = { papel: 'admin_socio', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string }
  return { contaId: conta.id as string, lojaId: loja.id as string, usuario }
}

async function modelo(tx: Tx, nome: string, preco: string | null, contaId: string | null = null) {
  const [m] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, preco_compra_padrao, conta_id)
    values ('M', ${'PC513 ' + nome}, 'autopropelido', '1000', 'hub', '32', ${preco}, ${contaId}) returning id`)
  return m.id as string
}

const ajustar = (tx: Tx, contaId: string, modeloId: string, preco: string) =>
  tx.execute(sql`insert into modelo_ajustes (conta_id, modelo_id, preco_compra_padrao) values (${contaId}, ${modeloId}, ${preco})`)

test('padrão vem do ajuste da Conta e do modelo próprio dela; o da plataforma não entra', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const daPlataforma = await modelo(tx, 'X12', '8000.00')
    const ajustado = await modelo(tx, 'R10', '8000.00')
    const proprio = await modelo(tx, 'Proprio', '3100.00', a.contaId)
    await ajustar(tx, a.contaId, ajustado, '2016.38')

    const r = await padrao.precosPadraoDaLoja(a.usuario, a.lojaId, tx)
    assert.ok('precos' in r)
    assert.equal(r.precos[ajustado], '2016.38')
    assert.equal(r.precos[proprio], '3100.00')
    assert.equal(r.precos[daPlataforma], undefined)
  })
})

test('Conta B nunca recebe o preço da Conta A, e loja da A responde como loja inexistente', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const ajustado = await modelo(tx, 'R10', null)
    const proprioDaA = await modelo(tx, 'Proprio A', '3100.00', a.contaId)
    await ajustar(tx, a.contaId, ajustado, '2016.38')

    const daB = await padrao.precosPadraoDaLoja(b.usuario, b.lojaId, tx)
    assert.deepEqual(daB, { precos: {} })

    const lojaDaA = await padrao.precosPadraoDaLoja(b.usuario, a.lojaId, tx)
    const inexistente = await padrao.precosPadraoDaLoja(b.usuario, crypto.randomUUID(), tx)
    assert.deepEqual(lojaDaA, { error: 'Loja não encontrada' })
    assert.deepEqual(inexistente, lojaDaA)
    assert.ok(!JSON.stringify([daB, lojaDaA]).includes(proprioDaA))
  })
})
