// Teste de banco: Postgres descartável, como src/lib/pecas-da-conta.db.test.ts.
// Estoque de peças por loja (#195): venda, edição e exclusão mexem só no saldo da loja
// da venda; outra loja da mesma Conta e outra Conta ficam como estavam.
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
let estoque: typeof import('@/lib/estoque-pecas-loja')
let inserirPeca: typeof import('@/lib/pecas-da-conta')['inserirPeca']
let listarPecas: typeof import('@/lib/pecas-da-conta')['listarPecas']
let aplicarVendaPeca: typeof import('@/lib/venda-peca')['aplicarVendaPeca']
let editarVendaPecaTx: typeof import('@/lib/editar-venda-peca')['editarVendaPecaTx']
let excluirVendaPecaTx: typeof import('@/lib/excluir-venda-peca')['excluirVendaPecaTx']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  estoque = await import('@/lib/estoque-pecas-loja')
  ;({ inserirPeca, listarPecas } = await import('@/lib/pecas-da-conta'))
  ;({ aplicarVendaPeca } = await import('@/lib/venda-peca'))
  ;({ editarVendaPecaTx } = await import('@/lib/editar-venda-peca'))
  ;({ excluirVendaPecaTx } = await import('@/lib/excluir-venda-peca'))
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

async function semearLoja(tx: Tx, grupoId: string, nome: string) {
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja EPL ' + nome}, 'C', 'R', ${grupoId}) returning id`)
  const [vend] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Vend', ${'vend-epl' + nome + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
  return { lojaId: loja.id as string, vendId: vend.id as string }
}

// Conta A com lojas X e Y; Conta B com loja Z. Uma peça em cada Conta.
async function semear(tx: Tx) {
  const [contaA] = await linhas(tx, sql`insert into contas (nome) values ('EPL A') returning id`)
  const [contaB] = await linhas(tx, sql`insert into contas (nome) values ('EPL B') returning id`)
  const [grupoA] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('EPL A', '11111111000191', ${contaA.id}) returning id`)
  const contaAId = contaA.id as string
  const [grupoB] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values ('EPL B', '22222222000191', ${contaB.id}) returning id`)
  const x = await semearLoja(tx, grupoA.id, 'X')
  const y = await semearLoja(tx, grupoA.id, 'Y')
  const z = await semearLoja(tx, grupoB.id, 'Z')
  const pecaA = (await inserirPeca(tx, contaA.id, { nome: 'Pneu A', valor: 50 })).id
  const pecaB = (await inserirPeca(tx, contaB.id, { nome: 'Pneu B', valor: 50 })).id
  return { contaAId, grupoA: grupoA.id as string, x, y, z, pecaA, pecaB }
}

const venda = (lojaId: string, pecaId: string, quantidade: number) => ({
  lojaId, itens: [{ pecaId, quantidade }], pagamentos: [{ tipo: 'pix', valor: 50 * quantidade }],
})

test('venda na loja X baixa só o saldo da X; a loja Y fica em zero (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx)
    await aplicarVendaPeca(tx, s.x.vendId, venda(s.x.lojaId, s.pecaA, 2))
    await aplicarVendaPeca(tx, s.x.vendId, venda(s.x.lojaId, s.pecaA, 1))

    assert.equal(await estoque.saldoNaLoja(tx, s.pecaA, s.x.lojaId), -3)
    assert.equal(await estoque.saldoNaLoja(tx, s.pecaA, s.y.lojaId), 0)
  })
})

test('edição acerta a diferença na loja da venda e exclusão devolve nela (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx)
    await aplicarVendaPeca(tx, s.y.vendId, venda(s.y.lojaId, s.pecaA, 1))
    const { id: vendaId } = await aplicarVendaPeca(tx, s.x.vendId, venda(s.x.lojaId, s.pecaA, 2))

    await editarVendaPecaTx(tx, {
      vendaId, grupoId: s.grupoA, usuarioId: s.x.vendId,
      itens: [{ pecaId: s.pecaA, quantidade: 5 }], pagamentos: [{ tipo: 'pix', valor: 250 }],
    })
    assert.equal(await estoque.saldoNaLoja(tx, s.pecaA, s.x.lojaId), -5)

    await excluirVendaPecaTx(tx, { id: s.x.vendId, papel: 'admin_geral', lojaId: null, gruposAcesso: [], contaId: '' }, vendaId)
    assert.equal(await estoque.saldoNaLoja(tx, s.pecaA, s.x.lojaId), 0)
    assert.equal(await estoque.saldoNaLoja(tx, s.pecaA, s.y.lojaId), -1)
  })
})

test('venda na Conta B recusa peça da Conta A e não cria saldo dela em loja nenhuma (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx)
    await assert.rejects(aplicarVendaPeca(tx, s.z.vendId, venda(s.z.lojaId, s.pecaA, 1)), /Peça não encontrada/)
    await aplicarVendaPeca(tx, s.z.vendId, venda(s.z.lojaId, s.pecaB, 1))

    const daPecaA = await linhas(tx, sql`select loja_id from pecas_estoque_loja where peca_id = ${s.pecaA}`)
    assert.deepEqual(daPecaA, [])
    assert.equal(await estoque.saldoNaLoja(tx, s.pecaB, s.z.lojaId), -1)
  })
})

test('saldo não grava peça de uma Conta em loja de outra (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx)
    await estoque.moverSaldo(tx, s.pecaA, s.z.lojaId, -4)
    assert.equal(await estoque.saldoNaLoja(tx, s.pecaA, s.z.lojaId), 0)
  })
})

test('catálogo mostra o saldo só da loja pedida; ajuste numa loja não mexe na outra (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx)
    assert.equal(await estoque.definirSaldo(tx, s.pecaA, s.x.lojaId, 7), true)
    assert.equal(await estoque.definirSaldo(tx, s.pecaA, s.x.lojaId, 4), true)

    const quemA = { papel: 'aux_adm', contaId: s.contaAId }
    const saldoEm = async (lojaId: string | null) =>
      (await listarPecas(tx, quemA, { lojaId })).find(p => p.id === s.pecaA)?.quantidadeEstoque
    assert.equal(await saldoEm(s.x.lojaId), 4)
    assert.equal(await saldoEm(s.y.lojaId), 0)
    assert.equal(await saldoEm(null), 0)
  })
})

test('ajuste não grava peça da Conta A em loja da Conta B (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx)
    assert.equal(await estoque.definirSaldo(tx, s.pecaA, s.z.lojaId, 9), false)
    const linhasA = await linhas(tx, sql`select 1 from pecas_estoque_loja where peca_id = ${s.pecaA}`)
    assert.deepEqual(linhasA, [])
  })
})

test('saldo é guardado em unidades inteiras (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const [col] = await linhas(tx, sql`select data_type from information_schema.columns
      where table_name = 'pecas_estoque_loja' and column_name = 'quantidade'`)
    assert.equal(col.data_type, 'integer')
  })
})

test('venda e edição recusam quantidade decimal mesmo vindo de aprovação, sem mexer no saldo (#195)', async () => {
  await emTransacaoDesfeita(async tx => {
    const s = await semear(tx)
    await assert.rejects(aplicarVendaPeca(tx, s.x.vendId, venda(s.x.lojaId, s.pecaA, 1.5)), /Quantidade é em unidades inteiras/)
    const { id: vendaId } = await aplicarVendaPeca(tx, s.x.vendId, venda(s.x.lojaId, s.pecaA, 1))
    await assert.rejects(editarVendaPecaTx(tx, {
      vendaId, grupoId: s.grupoA, usuarioId: s.x.vendId,
      itens: [{ pecaId: s.pecaA, quantidade: 2.5 }], pagamentos: [{ tipo: 'pix', valor: 125 }],
    }), /Quantidade é em unidades inteiras/)
    assert.equal(await estoque.saldoNaLoja(tx, s.pecaA, s.x.lojaId), -1)
  })
})
