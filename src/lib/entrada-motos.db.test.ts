// Teste de banco: Postgres descartável, como src/lib/entrada-pecas.db.test.ts.
// Loja de destino da entrada de motos (#488): o aux_adm com a Entrada liberada usa só
// loja da própria Conta, e loja de outra Conta recebe a mesma resposta de loja inexistente.
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
let entrada: typeof import('@/lib/entrada-motos')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  entrada = await import('@/lib/entrada-motos')
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
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'EM488 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'EM488 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja EM488 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [loja2] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja 2 EM488 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const usuario = { papel: 'aux_adm', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string }
  return { lojaId: loja.id as string, loja2Id: loja2.id as string, usuario }
}

test('aux_adm usa loja da própria Conta; loja da Conta A para o aux_adm da Conta B é igual a loja inexistente', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    assert.deepEqual(await entrada.lojaDestinoDaEntrada(b.usuario, b.loja2Id, tx), { loja: { id: b.loja2Id } })
    const deOutraConta = await entrada.lojaDestinoDaEntrada(b.usuario, a.lojaId, tx)
    const inexistente = await entrada.lojaDestinoDaEntrada(b.usuario, '00000000-0000-0000-0000-000000000000', tx)
    assert.deepEqual(deOutraConta, { error: 'Loja não encontrada' })
    assert.deepEqual(deOutraConta, inexistente)
  })
})
