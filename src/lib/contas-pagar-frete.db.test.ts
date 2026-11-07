// Teste de banco do #796 nas contas a pagar por percentual: "Venda de motos" e "Venda de motos com NF emitida" não contam
// o frete cobrado; "Faturamento total" conta, como o DRE (decisão do Luis, 07/11). Roda no Postgres descartável do CI;
// local: `npm run test:db:local`. A action grava de verdade: Conta própria e limpeza no after.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url

let usuario: { id: string; papel: string; lojaId: string; contaId: string; gruposAcesso: string[] }
const authMock = mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario, temPapel: () => false } })
// Fora de uma requisição não há cookie: o sócio cai no grupo da própria loja.
const headersMock = mock.module('next/headers', { namedExports: { cookies: async () => ({ get: () => undefined }) } })
const cacheMock = mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })

type Db = typeof import('@/lib/db')
let db: Db['db']
let execRows: Db['execRows']
let base: Base

const idDe = async (q: ReturnType<typeof sql>) => (await execRows(q))[0].id as string

async function novaVenda(vendedorId: string, valor: number, entrega: unknown, nf: string | null) {
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('CP796', ${randomUUID()}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, grupo_entrada_id)
    values (${'CP796-' + randomUUID()}, ${modeloId}, ${base.lojaId}, 'CINZA', '1', 'vendida', ${base.grupoId}) returning id`)
  const pedidoId = await idDe(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status) values (${motoId}, ${base.lojaId}, ${vendedorId}, 'efetivado') returning id`)
  await db.execute(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf,
      valor, forma_pagamento, pagamentos, data_venda, entrega, nota_fiscal_saida)
    values (${pedidoId}, ${motoId}, ${base.lojaId}, ${vendedorId}, ${vendedorId}, 'Cliente sintético', '52998224725',
      ${valor}, 'pix', ${JSON.stringify([{ tipo: 'pix', valor }])}::jsonb, '2026-09-15T15:00:00Z'::timestamptz,
      ${entrega === null ? null : JSON.stringify(entrega)}::jsonb, ${nf})`)
}

const CONTAS = [
  { descricao: 'CP796 motos', formula: 'venda_motos' },
  { descricao: 'CP796 motos com NF', formula: 'venda_motos_com_nf' },
  { descricao: 'CP796 faturamento total', formula: 'faturamento_total' },
]

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  const nome = randomUUID()
  base = await semearContaBase(db, { prefixo: 'CP796', nome, cnpj: nome })
  const socioId = await semearUsuario(db, base, { papel: 'admin_socio', rotulo: 'socio', comConta: true })
  usuario = { id: socioId, papel: 'admin_socio', lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [base.grupoId] }
  const vendedorId = await semearUsuario(db, base, { papel: 'vendedor', rotulo: 'vend' })
  // Moto 10.000 + frete 350, com NF; moto 8.000 sem frete e sem NF. Setembro é o mês apurado da competência de outubro.
  await novaVenda(vendedorId, 10350, { modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente', frete: 350 }, 'NF796')
  await novaVenda(vendedorId, 8000, null, null)
  for (const c of CONTAS) {
    await db.execute(sql`insert into contas_pagar (grupo_id, descricao, tipo, dia_vencimento, formula_base, formula_percentual, formula_mes_ref)
      values (${base.grupoId}, ${c.descricao}, 'automatica', 10, ${c.formula}, 10, 'anterior')`)
  }
})

after(async () => {
  authMock.restore()
  headersMock.restore()
  cacheMock.restore()
  await db.execute(sql`delete from contas_pagar_ocorrencias where conta_id in (select id from contas_pagar where grupo_id = ${base.grupoId})`)
  await db.execute(sql`delete from contas_pagar where grupo_id = ${base.grupoId}`)
  await db.execute(sql`delete from vendas where loja_id = ${base.lojaId}`)
  await db.execute(sql`delete from pedidos_venda where loja_id = ${base.lojaId}`)
  await db.execute(sql`delete from motos where loja_id = ${base.lojaId}`)
  await db.execute(sql`delete from modelos where marca = 'CP796'`)
  await db.execute(sql`delete from usuarios where loja_id = ${base.lojaId}`)
  await db.execute(sql`delete from lojas where id = ${base.lojaId}`)
  await db.execute(sql`delete from grupos where id = ${base.grupoId}`)
  await db.execute(sql`delete from contas where id = ${base.contaId}`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('conta por percentual: venda de motos e com NF sem o frete; faturamento total com o frete', async () => {
  const { listarContasDoMesAction } = await import('@/app/(dashboard)/contas-pagar/actions')
  const { doMes } = await listarContasDoMesAction('2026-10')
  const valor = Object.fromEntries(doMes.map(o => [o.descricao, Number(o.valor)]))
  assert.deepEqual(valor, {
    'CP796 motos': 1800,
    'CP796 motos com NF': 1000,
    'CP796 faturamento total': 1835,
  })
})
