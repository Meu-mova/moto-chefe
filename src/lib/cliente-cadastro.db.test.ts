// Teste de banco: Postgres descartável, como src/lib/cliente-da-os.db.test.ts.
// Cadastro e edição de cliente devolvem a recusa como { ok: false, erro } (#404): na produção o
// Next esconde a mensagem de erro lançado por Server Action, e a tela mostrava "React error #441".
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaVazia } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let mod: typeof import('@/lib/cliente-cadastro')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/cliente-cadastro')
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

// A recusa por CPF repetido nasce de um erro do Postgres, que aborta a transação do teste.
// Num savepoint desfeito a transação segue viva para as conferências seguintes.
class Recusou extends Error { constructor(readonly resultado: unknown) { super('recusou') } }
async function noSavepoint<T extends { ok: boolean }>(tx: Tx, fn: (sp: Tx) => Promise<T>): Promise<T> {
  try {
    return await tx.transaction(async sp => {
      const r = await fn(sp)
      if (!r.ok) throw new Recusou(r)
      return r
    })
  } catch (e) {
    if (e instanceof Recusou) return e.resultado as T
    throw e
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows

const CPF = '52998224725'
const OUTRO_CPF = '11144477735'
const SEM_ID = '00000000-0000-0000-0000-000000000000'
const cliente = (nome: string, cpfCnpj: string | null) => ({ nome, tipoPessoa: 'fisica' as const, sexo: 'nao_identificado' as const, cpfCnpj })

const contas = async (tx: Tx) => ({
  a: await semearContaVazia(tx, { prefixo: 'CL404', nome: 'A' }),
  b: await semearContaVazia(tx, { prefixo: 'CL404', nome: 'B' }),
})
const linhasDoCpf = async (tx: Tx, contaId: string, cpf: string) =>
  (await linhas(tx, sql`select id, nome, cpf_cnpj from clientes where conta_id = ${contaId} and cpf_cnpj = ${cpf}`))

test('CPF novo entra e devolve o id; o mesmo CPF de novo na Conta é recusado com a frase e fica 1 linha só', async () => {
  await emTransacaoDesfeita(async tx => {
    const { a } = await contas(tx)
    const primeiro = await noSavepoint(tx, sp => mod.cadastrarCliente(sp, { contaId: a }, cliente('Ana', CPF)))
    assert.ok(primeiro.ok)
    assert.deepEqual((await linhasDoCpf(tx, a, CPF)).map(l => l.id), [primeiro.id])

    const repetido = await noSavepoint(tx, sp => mod.cadastrarCliente(sp, { contaId: a }, cliente('Ana de novo', CPF)))
    assert.deepEqual(repetido, { ok: false, erro: 'CPF/CNPJ já cadastrado' })
    assert.equal((await linhasDoCpf(tx, a, CPF)).length, 1)
  })
})

test('Conta B cadastra o mesmo CPF da Conta A: a trava é por Conta, cada uma com a sua linha', async () => {
  await emTransacaoDesfeita(async tx => {
    const { a, b } = await contas(tx)
    assert.ok((await noSavepoint(tx, sp => mod.cadastrarCliente(sp, { contaId: a }, cliente('Ana', CPF)))).ok)
    assert.ok((await noSavepoint(tx, sp => mod.cadastrarCliente(sp, { contaId: b }, cliente('Ana na B', CPF)))).ok)
    assert.equal((await linhasDoCpf(tx, a, CPF)).length, 1)
    assert.equal((await linhasDoCpf(tx, b, CPF)).length, 1)
  })
})

test('editar cliente da própria Conta grava e devolve ok', async () => {
  await emTransacaoDesfeita(async tx => {
    const { a } = await contas(tx)
    const r = await noSavepoint(tx, sp => mod.cadastrarCliente(sp, { contaId: a }, cliente('Ana', CPF)))
    assert.ok(r.ok)
    assert.deepEqual(await noSavepoint(tx, sp => mod.atualizarCliente(sp, { contaId: a }, r.id, { nome: 'Ana Souza' })), { ok: true })
    assert.deepEqual((await linhasDoCpf(tx, a, CPF)).map(l => l.nome), ['Ana Souza'])
  })
})

test('Conta B editando cliente da Conta A recebe a mesma frase que id inexistente, e nada muda', async () => {
  await emTransacaoDesfeita(async tx => {
    const { a, b } = await contas(tx)
    const r = await noSavepoint(tx, sp => mod.cadastrarCliente(sp, { contaId: a }, cliente('Ana', CPF)))
    assert.ok(r.ok)
    const daOutraConta = await noSavepoint(tx, sp => mod.atualizarCliente(sp, { contaId: b }, r.id, { nome: 'Invasor' }))
    const inexistente = await noSavepoint(tx, sp => mod.atualizarCliente(sp, { contaId: b }, SEM_ID, { nome: 'Invasor' }))
    assert.deepEqual(daOutraConta, { ok: false, erro: 'Cliente não encontrado' })
    assert.deepEqual(inexistente, daOutraConta)
    assert.deepEqual((await linhasDoCpf(tx, a, CPF)).map(l => l.nome), ['Ana'])
  })
})

test('editar pondo o CPF de outro cliente da Conta é recusado com a frase, e o CPF original fica', async () => {
  await emTransacaoDesfeita(async tx => {
    const { a } = await contas(tx)
    assert.ok((await noSavepoint(tx, sp => mod.cadastrarCliente(sp, { contaId: a }, cliente('Ana', CPF)))).ok)
    const bia = await noSavepoint(tx, sp => mod.cadastrarCliente(sp, { contaId: a }, cliente('Bia', OUTRO_CPF)))
    assert.ok(bia.ok)
    assert.deepEqual(await noSavepoint(tx, sp => mod.atualizarCliente(sp, { contaId: a }, bia.id, { cpfCnpj: CPF })), { ok: false, erro: 'CPF/CNPJ já cadastrado' })
    assert.deepEqual((await linhasDoCpf(tx, a, OUTRO_CPF)).map(l => l.id), [bia.id])
  })
})
