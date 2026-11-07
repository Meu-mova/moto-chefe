// Teste de banco do #796: o frete cobrado (vendas.entrega->'frete', 4b da #726) soma no valor da venda e não pode
// inflar comissão, metas, relatório da fábrica nem esconder desconto. Roda no Postgres descartável do CI (job `banco`);
// local: `npm run test:db:local`. As consultas usam o db global: os dados são gravados de verdade e apagados no after.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { inArray, sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type ValorLiquido = typeof import('./valor-liquido')
let db: Db['db']
let execRows: Db['execRows']
let vendas: typeof import('@/lib/db/schema')['vendas']
let vl: ValorLiquido

const ENTREGAR = { modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente' }
const DIA = '2026-09-15T15:00:00Z'
const contas: Base[] = []
const venda: Record<'frete' | 'semFrete' | 'retira' | 'cartao' | 'editada' | 'outraConta', string> = {
  frete: '', semFrete: '', retira: '', cartao: '', editada: '', outraConta: '',
}
let vendedorA = ''

const idDe = async (q: ReturnType<typeof sql>) => (await execRows(q))[0].id as string

async function novaVenda(base: Base, vendedorId: string, valor: number, entrega: unknown) {
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('VM796', ${randomUUID()}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, grupo_entrada_id)
    values (${'VM796-' + randomUUID()}, ${modeloId}, ${base.lojaId}, 'CINZA', '1', 'vendida', ${base.grupoId}) returning id`)
  const pedidoId = await idDe(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status) values (${motoId}, ${base.lojaId}, ${vendedorId}, 'efetivado') returning id`)
  return idDe(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf,
      valor, forma_pagamento, pagamentos, data_venda, entrega)
    values (${pedidoId}, ${motoId}, ${base.lojaId}, ${vendedorId}, ${vendedorId}, 'Cliente sintético', '52998224725',
      ${valor}, 'pix', ${JSON.stringify([{ tipo: 'pix', valor }])}::jsonb, ${DIA}::timestamptz,
      ${entrega === null ? null : JSON.stringify(entrega)}::jsonb) returning id`)
}

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ vendas } = await import('@/lib/db/schema'))
  vl = await import('./valor-liquido')
  const [a, b] = [randomUUID(), randomUUID()]
  const contaA = await semearContaBase(db, { prefixo: 'VM796', nome: a, cnpj: a })
  const contaB = await semearContaBase(db, { prefixo: 'VM796', nome: b, cnpj: b })
  contas.push(contaA, contaB)
  vendedorA = await semearUsuario(db, contaA, { papel: 'vendedor' })
  const vendedorB = await semearUsuario(db, contaB, { papel: 'vendedor' })
  venda.frete = await novaVenda(contaA, vendedorA, 10350, { ...ENTREGAR, frete: 350 })
  venda.semFrete = await novaVenda(contaA, vendedorA, 8000, null)
  venda.retira = await novaVenda(contaA, vendedorA, 6000, { modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte' })
  // Cartão conciliado: bruto 5.350, líquido 5.250 (taxa 100). Líquido da moto = 5.250 − 350 (decisão do Luis, 07/11).
  venda.cartao = await novaVenda(contaA, vendedorA, 5350, { ...ENTREGAR, frete: 350 })
  await db.execute(sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, valor_bruto, valor_liquido, venda_id, conciliado)
    values (${contaA.grupoId}, 'stone', '2026-09-15', 5350, 5250, ${venda.cartao}, true)`)
  // Editar venda mudou o valor para baixo do frete: o valor da moto não fica negativo.
  venda.editada = await novaVenda(contaA, vendedorA, 200, { ...ENTREGAR, frete: 350 })
  venda.outraConta = await novaVenda(contaB, vendedorB, 7350, { ...ENTREGAR, frete: 350 })
})

after(async () => {
  const lojaIds = contas.map(c => c.lojaId)
  const em = (ids: string[]) => sql.join(ids.map(i => sql`${i}`), sql`, `)
  await db.execute(sql`delete from conciliacoes_cartao where grupo_id in (${em(contas.map(c => c.grupoId))})`)
  await db.execute(sql`delete from vendas where loja_id in (${em(lojaIds)})`)
  await db.execute(sql`delete from pedidos_venda where loja_id in (${em(lojaIds)})`)
  await db.execute(sql`delete from motos where loja_id in (${em(lojaIds)})`)
  await db.execute(sql`delete from modelos where marca = 'VM796'`)
  await db.execute(sql`delete from usuarios where loja_id in (${em(lojaIds)})`)
  await db.execute(sql`delete from lojas where id in (${em(lojaIds)})`)
  await db.execute(sql`delete from grupos where id in (${em(contas.map(c => c.grupoId))})`)
  await db.execute(sql`delete from contas where id in (${em(contas.map(c => c.contaId))})`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const ESPERADO = {
  frete: { frete: 350, moto: 10000, liquidoMoto: 10000 },
  semFrete: { frete: 0, moto: 8000, liquidoMoto: 8000 },
  retira: { frete: 0, moto: 6000, liquidoMoto: 6000 },
  cartao: { frete: 350, moto: 5000, liquidoMoto: 4900 },
  editada: { frete: 350, moto: 0, liquidoMoto: 0 },
}

test('valor da moto = valor da venda menos o frete (mínimo 0); sem frete, igual ao valor de hoje; cartão: líquido menos o frete inteiro', async () => {
  const ids = Object.fromEntries(Object.entries(venda).map(([k, id]) => [id, k]))
  const linhas = await db.select({
    id: vendas.id,
    frete: sql<string>`${vl.freteDaVendaExpr()}`,
    moto: sql<string>`${vl.valorDaMotoExpr()}`,
    liquidoMoto: sql<string>`${vl.valorLiquidoDaMotoExpr()}`,
  }).from(vendas).where(inArray(vendas.id, Object.keys(ESPERADO).map(k => venda[k as keyof typeof ESPERADO])))
  const porNome = Object.fromEntries(linhas.map(l => [ids[l.id], { frete: Number(l.frete), moto: Number(l.moto), liquidoMoto: Number(l.liquidoMoto) }]))
  assert.deepEqual(porNome, ESPERADO)
})

test('as formas em SQL cru (alias v) dão o mesmo resultado das formas do Drizzle', async () => {
  const ids = Object.fromEntries(Object.entries(venda).map(([k, id]) => [id, k]))
  const linhas = await execRows(sql`
    select v.id, ${vl.freteDaVendaSql('v')} as frete, ${vl.valorDaMotoSql('v')} as moto, ${vl.valorLiquidoDaMotoSql('v')} as liquido_moto
      from vendas v where v.id in (${sql.join(Object.keys(ESPERADO).map(k => sql`${venda[k as keyof typeof ESPERADO]}`), sql`, `)})`)
  const porNome = Object.fromEntries(linhas.map(l => [ids[String(l.id)], { frete: Number(l.frete), moto: Number(l.moto), liquidoMoto: Number(l.liquido_moto) }]))
  assert.deepEqual(porNome, ESPERADO)
})

// Líquido da moto das vendas da Conta A: 10.000 + 8.000 + 6.000 + 4.900 + 0. Com o frete seria 29.800.
const LIQUIDO_MOTOS_A = 28900
const BRUTO_MOTOS_A = 29000

test('comissão e premiação do vendedor (folha) contam só a moto, sem o frete; a venda da Conta B não entra', async () => {
  const { buscarDadosFolha } = await import('./folha')
  const [a] = contas
  const dados = await buscarDadosFolha({ mes: '2026-09', lojaIds: [a.lojaId], grupoId: a.grupoId })
  assert.deepEqual(dados.vendasPorVendedor.map(v => [v.vendedorId, Number(v.total)]), [[vendedorA, LIQUIDO_MOTOS_A]])
  assert.deepEqual(dados.motosPorLoja.map(l => [l.lojaId, Number(l.total)]), [[a.lojaId, LIQUIDO_MOTOS_A]])
})

test('metas de faturamento (mês e dia) contam o valor da moto, sem o frete', async () => {
  const { realizadoDoMes, vendidoNoDia } = await import('./metas')
  const [a] = contas
  assert.deepEqual([...(await realizadoDoMes([a.lojaId], 2026, 9)).entries()], [[a.lojaId, BRUTO_MOTOS_A]])
  assert.equal(await vendidoNoDia([a.lojaId], 2026, 9, 15), BRUTO_MOTOS_A)
})
