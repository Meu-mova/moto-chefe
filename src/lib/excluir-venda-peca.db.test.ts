// Teste de banco: Postgres descartável, como src/lib/editar-cliente-venda-peca.db.test.ts
// (roteiro para rodar local no topo de src/lib/efetivar-pedido.db.test.ts).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let excluirVendaPecaTx: typeof import('@/lib/excluir-venda-peca')['excluirVendaPecaTx']

before(async () => {
  ;({ db } = await import('@/lib/db'))
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
  const base = await semearContaBase(tx, { prefixo: 'EX404', nome, cnpj })
  const auxId = await semearUsuario(tx, base, { papel: 'aux_adm', rotulo: 'aux' })
  const socioId = await semearUsuario(tx, base, { papel: 'admin_socio', rotulo: 'socio', semLoja: true })
  const [peca] = await linhas(tx, sql`with p as (insert into pecas_catalogo (nome, valor, conta_id) values ('Retrovisor', 50, ${base.contaId}) returning id) insert into pecas_estoque_loja (peca_id, loja_id, quantidade) select id, ${base.lojaId}, 8 from p returning peca_id as id`)
  return {
    grupoId: base.grupoId, lojaId: base.lojaId, pecaId: peca.id as string,
    aux: { id: auxId, papel: 'aux_adm', lojaId: base.lojaId, gruposAcesso: null, contaId: base.contaId },
    socio: { id: socioId, papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId },
  }
}

async function semearVendaConciliada(tx: Tx, c: Awaited<ReturnType<typeof semearConta>>) {
  const [venda] = await linhas(tx, sql`insert into vendas_pecas (loja_id, vendedor_id, forma_pagamento, pagamentos, valor_total)
    values (${c.lojaId}, ${c.aux.id}, 'credito', ${JSON.stringify([{ tipo: 'credito', valor: 100 }])}::jsonb, 100) returning id, numero`)
  await linhas(tx, sql`insert into vendas_pecas_itens (venda_peca_id, peca_id, descricao, quantidade, valor_unitario)
    values (${venda.id}, ${c.pecaId}, 'Retrovisor', 2, 50)`)
  const [cartao] = await linhas(tx, sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, valor_bruto, peca_venda_id, conciliado)
    values (${c.grupoId}, 'stone', '2026-10-20', 100, ${venda.id}, true) returning id`)
  return { id: venda.id as string, numero: venda.numero as number, cartaoId: cartao.id as string }
}

// Uma loja por Conta no cenário: o saldo dela é o da peça (#195).
const estoque = async (tx: Tx, pecaId: string) =>
  Number((await linhas(tx, sql`select coalesce(sum(quantidade), 0) q from pecas_estoque_loja where peca_id = ${pecaId}`))[0].q)
const existe = async (tx: Tx, vendaId: string) =>
  (await linhas(tx, sql`select 1 from vendas_pecas where id = ${vendaId}`)).length === 1
const cartaoDb = async (tx: Tx, id: string) =>
  (await linhas(tx, sql`select peca_venda_id, conciliado from conciliacoes_cartao where id = ${id}`))[0]

test('a própria Conta exclui: estoque volta e a conciliação fica livre', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040401')
    const venda = await semearVendaConciliada(tx, a)
    const r = await excluirVendaPecaTx(tx, a.aux, venda.id)
    assert.equal(r.numero, venda.numero)
    assert.equal(await existe(tx, venda.id), false)
    assert.equal(await estoque(tx, a.pecaId), 10)
    assert.deepEqual(await cartaoDb(tx, venda.cartaoId), { peca_venda_id: null, conciliado: false })
  })
})

test('Conta B (aux e sócio) não exclui a venda da Conta A: mesma frase de id inexistente e nada muda (#404)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040402')
    const b = await semearConta(tx, 'B', '00000000040403')
    const venda = await semearVendaConciliada(tx, a)
    for (const usuario of [b.aux, b.socio]) {
      await assert.rejects(excluirVendaPecaTx(tx, usuario, venda.id), /^Error: Venda não encontrada$/)
      await assert.rejects(excluirVendaPecaTx(tx, usuario, crypto.randomUUID()), /^Error: Venda não encontrada$/)
    }
    assert.equal(await existe(tx, venda.id), true)
    assert.equal(await estoque(tx, a.pecaId), 8)
    assert.deepEqual(await cartaoDb(tx, venda.cartaoId), { peca_venda_id: venda.id, conciliado: true })
  })
})
