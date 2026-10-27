// Teste de banco: Postgres descartável, como src/lib/excluir-venda-peca.db.test.ts.
// Catálogo de peças por Conta (#195): a Conta B não lê, não altera e não vende peça da A.
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
let mod: typeof import('@/lib/pecas-da-conta')
let saldos: typeof import('@/lib/estoque-pecas-loja')
let aplicarVendaPeca: typeof import('@/lib/venda-peca')['aplicarVendaPeca']
let editarVendaPecaTx: typeof import('@/lib/editar-venda-peca')['editarVendaPecaTx']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/pecas-da-conta')
  saldos = await import('@/lib/estoque-pecas-loja')
  ;({ aplicarVendaPeca } = await import('@/lib/venda-peca'))
  ;({ editarVendaPecaTx } = await import('@/lib/editar-venda-peca'))
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
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'PC195 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'PC195 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja PC195 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [vend] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Vend', ${'vend-pc195' + nome + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
  const contaId = conta.id as string
  const peca = await mod.inserirPeca(tx, contaId, { nome: 'Retrovisor ' + nome, valor: 50 })
  assert.equal(await saldos.definirSaldo(tx, peca.id, loja.id, 8), true)
  return { contaId, lojaId: loja.id as string, vendId: vend.id as string, pecaId: peca.id }
}

const estoque = (tx: Tx, c: { pecaId: string; lojaId: string }) => saldos.saldoNaLoja(tx, c.pecaId, c.lojaId)

const venda = (lojaId: string, pecaId: string) => ({
  lojaId, itens: [{ pecaId, quantidade: 1 }], pagamentos: [{ tipo: 'pix', valor: 50 }],
})

test('Conta B não lista peça da Conta A; admin_geral vê as duas (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const nomes = async (quem: { papel: string; contaId: string }) =>
      (await mod.listarPecas(tx, quem)).map(p => p.id)

    const daB = await nomes({ papel: 'aux_adm', contaId: b.contaId })
    assert.ok(daB.includes(b.pecaId))
    assert.ok(!daB.includes(a.pecaId))

    const doAdmin = await nomes({ papel: 'admin_geral', contaId: b.contaId })
    assert.ok(doAdmin.includes(a.pecaId) && doAdmin.includes(b.pecaId))
  })
})

test('Conta B não altera peça da Conta A: mesma resposta de peça inexistente (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const quemB = { papel: 'aux_adm', contaId: b.contaId }

    assert.equal(await mod.alterarPeca(tx, quemB, a.pecaId, { nome: 'Trocado', ativo: false }), false)
    assert.equal(await mod.alterarPeca(tx, quemB, '00000000-0000-0000-0000-000000000000', { ativo: false }), false)
    const [pecaA] = await linhas(tx, sql`select nome, ativo from pecas_catalogo where id = ${a.pecaId}`)
    assert.deepEqual(pecaA, { nome: 'Retrovisor A', ativo: true })

    // Saldo da peça da A na loja da B: não grava, como peça inexistente.
    assert.equal(await saldos.definirSaldo(tx, a.pecaId, b.lojaId, 0), false)
    assert.equal(await saldos.definirSaldo(tx, '00000000-0000-0000-0000-000000000000', b.lojaId, 0), false)
    assert.equal(await estoque(tx, a), 8)

    assert.equal(await saldos.definirSaldo(tx, b.pecaId, b.lojaId, 3), true)
    assert.equal(await estoque(tx, b), 3)
  })
})

test('venda numa loja da Conta B recusa peça da Conta A e não mexe no estoque dela (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')

    await assert.rejects(aplicarVendaPeca(tx, b.vendId, venda(b.lojaId, a.pecaId)), /Peça não encontrada/)
    assert.equal(await estoque(tx, a), 8)

    await aplicarVendaPeca(tx, b.vendId, venda(b.lojaId, b.pecaId))
    assert.equal(await estoque(tx, b), 7)
  })
})

test('edição de venda da Conta B recusa trocar o item por peça da Conta A (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const { id: vendaId } = await aplicarVendaPeca(tx, b.vendId, venda(b.lojaId, b.pecaId))

    await assert.rejects(editarVendaPecaTx(tx, {
      vendaId, grupoId: '', usuarioId: b.vendId,
      itens: [{ pecaId: a.pecaId, quantidade: 1 }], pagamentos: [{ tipo: 'pix', valor: 50 }],
    }), /Peça não encontrada/)
    assert.equal(await estoque(tx, a), 8)
  })
})

test('OS de loja da Conta B só usa peça da Conta B (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')

    const ids = (await mod.listarPecasDaLoja(tx, b.lojaId)).map(p => p.id)
    assert.deepEqual(ids, [b.pecaId])
    assert.equal(await mod.pecaUsavelNaLoja(tx, b.lojaId, a.pecaId), false)
    assert.equal(await mod.pecaUsavelNaLoja(tx, b.lojaId, b.pecaId), true)
  })
})
