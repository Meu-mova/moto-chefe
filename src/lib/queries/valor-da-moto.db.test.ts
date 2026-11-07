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
const venda: Record<'frete' | 'semFrete' | 'retira' | 'retiraComFrete' | 'cartao' | 'editada' | 'outraConta', string> = {
  frete: '', semFrete: '', retira: '', retiraComFrete: '', cartao: '', editada: '', outraConta: '',
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
  // Frete fora do modo 'entregar' não existe pelo servidor do 4b; o SQL segue a mesma regra do TS e não o desconta.
  venda.retiraComFrete = await novaVenda(contaB, vendedorB, 4350, { modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte', frete: 350 })
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
  await db.execute(sql`delete from aprovacoes_venda where loja_id in (${em(lojaIds)})`)
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
  retiraComFrete: { frete: 0, moto: 4350, liquidoMoto: 4350 },
}

test('valor da moto = valor da venda menos o frete (mínimo 0); sem frete, igual ao valor de hoje; cartão: líquido menos o frete inteiro', async () => {
  const ids = Object.fromEntries(Object.entries(venda).map(([k, id]) => [id, k]))
  const linhas = await db.select({
    id: vendas.id,
    frete: sql<string>`${vl.freteDaVendaExpr()}`,
    moto: sql<string>`${vl.valorDaMotoNosRelatoriosExpr()}`,
    liquidoMoto: sql<string>`${vl.valorLiquidoDaMotoExpr()}`,
  }).from(vendas).where(inArray(vendas.id, Object.keys(ESPERADO).map(k => venda[k as keyof typeof ESPERADO])))
  const porNome = Object.fromEntries(linhas.map(l => [ids[l.id], { frete: Number(l.frete), moto: Number(l.moto), liquidoMoto: Number(l.liquidoMoto) }]))
  assert.deepEqual(porNome, ESPERADO)
})

test('as formas em SQL cru (alias v) dão o mesmo resultado das formas do Drizzle', async () => {
  const ids = Object.fromEntries(Object.entries(venda).map(([k, id]) => [id, k]))
  const linhas = await execRows(sql`
    select v.id, ${vl.freteDaVendaSql('v')} as frete, ${vl.valorDaMotoNosRelatoriosSql('v')} as moto, ${vl.valorLiquidoDaMotoSql('v')} as liquido_moto
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

test('relatório da fábrica soma o valor da moto, sem o frete', async () => {
  const { carregarRelatorioFabrica } = await import('./relatorio-fabrica')
  const [a] = contas
  const aux = { id: vendedorA, papel: 'aux_adm', lojaId: a.lojaId, contaId: a.contaId, gruposAcesso: [] }
  const r = await carregarRelatorioFabrica(aux as unknown as Parameters<typeof carregarRelatorioFabrica>[0], '2026-09-01', '2026-09-30')
  assert.equal(r.totalQtd, 5)
  assert.equal(r.totalValor, BRUTO_MOTOS_A)
})

test('desconto contra o preço mínimo aparece mesmo com o frete somado à venda (o frete não esconde desconto)', async () => {
  const { descontosDasVendas, totalDescontos } = await import('./descontos')
  const [a] = contas
  // Mínimo 10.200; moto vendida a 10.000 + frete 350. Pelo valor da venda (10.350) o desconto sumiria.
  await db.execute(sql`insert into aprovacoes_venda (moto_id, loja_id, vendedor_id, valor, dados_venda, motivo, status, data_resposta,
      tipo, valor_minimo_snapshot, liquido_snapshot)
    select v.moto_id, v.loja_id, v.vendedor_id, 10000, '{}'::jsonb, 'Abaixo do mínimo', 'aprovada', ${DIA}::timestamptz,
      'valor_minimo', 10200, 10000 from vendas v where v.id = ${venda.frete}`)
  assert.equal((await descontosDasVendas([venda.frete])).get(venda.frete)?.preco, 200)
  const total = await totalDescontos({ dataInicio: '2026-09-01', dataFim: '2026-09-30', lojaId: [a.lojaId] })
  assert.deepEqual({ qtd: total.qtd, preco: total.preco, margem: total.margem }, { qtd: 1, preco: 200, margem: 200 })
})

const SETEMBRO = { dataInicio: '2026-09-01', dataFim: '2026-09-30' }

test('dashboard: rankings de vendedor, loja e modelo e o preço médio contam a moto, sem o frete', async () => {
  const d = await import('./dashboard')
  const [a] = contas
  const filtros = { ...SETEMBRO, lojaId: [a.lojaId] }
  const vendedores = await d.getRankingVendedores(filtros)
  assert.deepEqual(vendedores.map(v => Number(v.faturamento)), [LIQUIDO_MOTOS_A])
  const lojasRank = await d.getRankingLojas(filtros)
  assert.deepEqual(lojasRank.map(l => Number(l.faturamento)), [LIQUIDO_MOTOS_A])
  const modelos = await d.getModelosMaisVendidos(filtros)
  assert.equal(modelos.reduce((s, m) => s + Number(m.faturamento), 0), LIQUIDO_MOTOS_A)
  assert.equal(await d.getPrecoMedioVendas(filtros), BRUTO_MOTOS_A / 5)
  assert.equal(await d.getPrecoMedioVendas(filtros, { useLiquidoValue: true }), LIQUIDO_MOTOS_A / 5)
})

test('fechamento, coletiva e individual (relatórios de venda de motos) contam a moto, sem o frete; a forma de pagamento segue com o total', async () => {
  const [a] = contas
  const mes = { grupoId: a.grupoId, lojaIds: [a.lojaId], ano: 2026, mes: 9 }
  const { dadosFechamento } = await import('./fechamento')
  const f = await dadosFechamento(mes)
  assert.deepEqual([f.consolidado.faturamento, f.consolidado.faturamentoBruto], [LIQUIDO_MOTOS_A, BRUTO_MOTOS_A])
  assert.equal(f.vendedores.reduce((s, v) => s + v.total, 0), LIQUIDO_MOTOS_A)
  assert.equal(f.modelos.reduce((s, m) => s + m.total, 0), LIQUIDO_MOTOS_A)
  assert.equal(f.diario.reduce((s, d) => s + d.total, 0), LIQUIDO_MOTOS_A)
  assert.equal(f.pagamento.reduce((s, p) => s + p.total, 0), 29900)

  const { dadosColetiva } = await import('./coletiva')
  const c = await dadosColetiva(mes)
  assert.deepEqual([c.consolidado.faturamento, c.consolidado.faturamentoBruto], [LIQUIDO_MOTOS_A, BRUTO_MOTOS_A])

  const { dadosIndividual } = await import('./individual')
  const i = await dadosIndividual(mes)
  assert.deepEqual(i.vendedores.map(v => [v.usuarioId, v.faturamento]), [[vendedorA, LIQUIDO_MOTOS_A]])
})

test('faturamento por origem da venda (marketing) conta a moto, sem o frete', async () => {
  const m = await import('./marketing')
  const [a] = contas
  assert.equal((await m.resumoVendasPorOrigem(a.grupoId, SETEMBRO.dataInicio, SETEMBRO.dataFim)).faturamento, BRUTO_MOTOS_A)
  const porOrigem = await m.vendasPorOrigem(a.grupoId, SETEMBRO.dataInicio, SETEMBRO.dataFim)
  assert.equal(porOrigem.reduce((s, o) => s + o.faturamento, 0), BRUTO_MOTOS_A)
})

test('DRE segue com o frete como receita (decisão do Luis, 07/11): receita de motos = o que os clientes pagaram', async () => {
  const { dreDoMes } = await import('./dre')
  const [a] = contas
  const { colunas } = await dreDoMes({ grupoId: a.grupoId, lojaIds: [a.lojaId], ano: 2026, mes: 9 })
  assert.equal(colunas.find(c => c.chave === a.lojaId)?.entrada.receitaMotos, 29900)
})

test('lista de vendas traz o valor da venda (o que o cliente pagou) e o valor da moto, base do % de desconto', async () => {
  const { listarVendas } = await import('./vendas')
  const [a] = contas
  const lista = await listarVendas({ lojaId: [a.lojaId], dataInicio: SETEMBRO.dataInicio, dataFim: SETEMBRO.dataFim })
  const daFrete = lista.find(v => v.id === venda.frete)
  assert.deepEqual([Number(daFrete?.valor), Number(daFrete?.valorMoto)], [10350, 10000])
  assert.equal(lista.reduce((s, v) => s + Number(v.valorMoto), 0), BRUTO_MOTOS_A)
})

test('KPIs do dashboard: faturamento com o frete e faturamento das motos sem ele, no bruto e no líquido', async () => {
  const { getKPIs } = await import('./dashboard')
  const [a] = contas
  const filtros = { ...SETEMBRO, lojaId: [a.lojaId] }
  const bruto = await getKPIs(filtros)
  assert.deepEqual([bruto.totalVendas, bruto.faturamento, bruto.faturamentoMoto], [5, 29900, BRUTO_MOTOS_A])
  const liquido = await getKPIs(filtros, { useLiquidoValue: true })
  assert.deepEqual([liquido.faturamento, liquido.faturamentoMoto], [29800, LIQUIDO_MOTOS_A])
})
