// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
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
let aplicarVendaPeca: typeof import('@/lib/venda-peca')['aplicarVendaPeca']
let editarVendaPecaTx: typeof import('@/lib/editar-venda-peca')['editarVendaPecaTx']
let excluirVendaPecaTx: typeof import('@/lib/excluir-venda-peca')['excluirVendaPecaTx']

before(async () => {
  ;({ db } = await import('@/lib/db'))
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

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'CX546 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'CX546 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja CX546 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Aux', ${'aux-cx546' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}) returning id`)
  const [peca] = await linhas(tx, sql`with p as (insert into pecas_catalogo (nome, valor, conta_id) values ('Retrovisor', 144, ${conta.id}) returning id) insert into pecas_estoque_loja (peca_id, loja_id, quantidade) select id, ${loja.id}, 8 from p returning peca_id as id`)
  return {
    grupoId: grupo.id as string, lojaId: loja.id as string, pecaId: peca.id as string,
    aux: { id: aux.id as string, papel: 'aux_adm', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string },
  }
}

type Conta = Awaited<ReturnType<typeof semearConta>>
const vender = (tx: Tx, c: Conta, pagamentos: { tipo: string; valor: number }[]) =>
  aplicarVendaPeca(tx, c.aux.id, { lojaId: c.lojaId, itens: [{ pecaId: c.pecaId, quantidade: 2 }], pagamentos })
const editar = (tx: Tx, c: Conta, vendaId: string, pagamentos: { tipo: string; valor: number }[]) =>
  editarVendaPecaTx(tx, { vendaId, grupoId: c.grupoId, usuarioId: c.aux.id, itens: [{ pecaId: c.pecaId, quantidade: 2 }], pagamentos })
const caixa = (tx: Tx, vendaId: string) =>
  linhas(tx, sql`select loja_id, tipo, categoria, valor::text, data::text, usuario_id from lancamentos_caixa where venda_peca_id = ${vendaId} order by valor`)
const caixaDaLoja = (tx: Tx, lojaId: string) =>
  linhas(tx, sql`select venda_peca_id, valor::text from lancamentos_caixa where loja_id = ${lojaId}`)

test('venda de peças em dinheiro entra no caixa da loja da venda, no dia da venda (#546)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000054601')
    const venda = await vender(tx, a, [{ tipo: 'dinheiro', valor: 288 }])
    const [hoje] = await linhas(tx, sql`select (data_venda at time zone 'America/Sao_Paulo')::date::text d from vendas_pecas where id = ${venda.id}`)
    assert.deepEqual(await caixa(tx, venda.id), [
      { loja_id: a.lojaId, tipo: 'entrada', categoria: 'Venda de peças', valor: '288.00', data: hoje.d, usuario_id: a.aux.id },
    ])
  })
})

test('PIX e cartão não entram no caixa; no pagamento misto entra só o dinheiro', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000054601')
    const pix = await vender(tx, a, [{ tipo: 'pix', valor: 288 }])
    assert.equal((await caixa(tx, pix.id)).length, 0)
    const misto = await vender(tx, a, [{ tipo: 'pix', valor: 188 }, { tipo: 'dinheiro', valor: 100 }])
    assert.deepEqual((await caixa(tx, misto.id)).map(l => l.valor), ['100.00'])
  })
})

test('editar refaz o caixa: troca o valor, some ao virar PIX e volta ao virar dinheiro', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000054601')
    const venda = await vender(tx, a, [{ tipo: 'dinheiro', valor: 288 }])
    await editar(tx, a, venda.id, [{ tipo: 'dinheiro', valor: 200 }, { tipo: 'pix', valor: 88 }])
    assert.deepEqual((await caixa(tx, venda.id)).map(l => l.valor), ['200.00'])
    await editar(tx, a, venda.id, [{ tipo: 'pix', valor: 288 }])
    assert.equal((await caixa(tx, venda.id)).length, 0)
    await editar(tx, a, venda.id, [{ tipo: 'dinheiro', valor: 288 }])
    assert.deepEqual((await caixa(tx, venda.id)).map(l => l.valor), ['288.00'])
  })
})

test('venda antiga (anterior à #546) editada para dinheiro não ganha entrada: a loja lançou à mão', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000054601')
    const [antiga] = await linhas(tx, sql`insert into vendas_pecas (loja_id, vendedor_id, forma_pagamento, pagamentos, valor_total)
      values (${a.lojaId}, ${a.aux.id}, 'dinheiro', ${JSON.stringify([{ tipo: 'dinheiro', valor: 288 }])}::jsonb, 288) returning id`)
    await linhas(tx, sql`insert into vendas_pecas_itens (venda_peca_id, peca_id, descricao, quantidade, valor_unitario)
      values (${antiga.id}, ${a.pecaId}, 'Retrovisor', 2, 144)`)
    await editar(tx, a, antiga.id, [{ tipo: 'dinheiro', valor: 300 }])
    assert.equal((await caixa(tx, antiga.id)).length, 0)
  })
})

test('excluir a venda tira o dinheiro dela do caixa', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000054601')
    const venda = await vender(tx, a, [{ tipo: 'dinheiro', valor: 288 }])
    await excluirVendaPecaTx(tx, a.aux, venda.id)
    assert.equal((await caixa(tx, venda.id)).length, 0)
  })
})

test('Conta B não exclui a venda da Conta A e o caixa da A fica intacto; a venda da B não toca o caixa da A', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000054601')
    const b = await semearConta(tx, 'B', '00000000054602')
    const vendaA = await vender(tx, a, [{ tipo: 'dinheiro', valor: 288 }])
    await assert.rejects(excluirVendaPecaTx(tx, b.aux, vendaA.id), /^Error: Venda não encontrada$/)
    const vendaB = await vender(tx, b, [{ tipo: 'dinheiro', valor: 50 }])
    assert.deepEqual(await caixaDaLoja(tx, a.lojaId), [{ venda_peca_id: vendaA.id, valor: '288.00' }])
    assert.deepEqual(await caixaDaLoja(tx, b.lojaId), [{ venda_peca_id: vendaB.id, valor: '50.00' }])
  })
})
