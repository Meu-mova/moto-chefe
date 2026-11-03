// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// O relatório da fábrica conta só a marca da fábrica: moto Voe vendida na loja fica fora.
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
let mod: typeof import('@/lib/queries/relatorio-fabrica')
let MARCA_DA_FABRICA: string

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/queries/relatorio-fabrica')
  ;({ MARCA_DA_FABRICA } = await import('@/lib/modelos-da-conta'))
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

async function vender(tx: Tx, lojaId: string, vendedorId: string, marca: string, chassi: string, valor: number, data: string) {
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values (${marca}, ${'RF ' + chassi}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status)
    values (${chassi}, ${modelo.id}, ${lojaId}, 'AZUL', '1', 'vendida') returning id`)
  const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status)
    values (${moto.id}, ${lojaId}, ${vendedorId}, 'efetivado') returning id`)
  await linhas(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, data_venda)
    values (${pedido.id}, ${moto.id}, ${lojaId}, ${vendedorId}, ${vendedorId}, 'Cliente', '52998224725', ${valor}, 'pix', ${data + 'T12:00:00Z'})`)
}

test('só a marca da fábrica entra; Voe vendida na mesma loja e no mesmo mês fica fora', async () => {
  await emTransacaoDesfeita(async tx => {
    const base = await semearContaBase(tx, { prefixo: 'RFAB', nome: 'A', cnpj: '11222333000181' })
    const vendedor = await semearUsuario(tx, base, { papel: 'vendedor' })
    const sufixo = String(Math.floor(Math.random() * 1e9))
    await vender(tx, base.lojaId, vendedor, MARCA_DA_FABRICA, 'RFABMC' + sufixo, 10000, '2026-10-10')
    await vender(tx, base.lojaId, vendedor, 'Voe', 'RFABVOE' + sufixo, 8000, '2026-10-12')

    const r = await mod.linhasRelatorioFabrica([base.lojaId], '2026-10-01', '2026-10-31', tx)
    assert.deepEqual(r.map(l => [l.marca, l.quantidade, l.valor]), [[MARCA_DA_FABRICA, 1, 10000]])
  })
})
