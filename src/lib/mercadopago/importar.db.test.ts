// Teste de banco: importação da maquininha Mercado Pago de um grupo, contra o Postgres descartável do
// CI. Só a API do Mercado Pago (a rede) é simulada, pelo `buscar` injetado; casamento, upsert do Pix e
// estorno rodam de verdade. A importação grava fora de transação de teste (ela abre a sua), então cada
// cenário cria os próprios grupos e ids de pagamento e só conta o que é dele.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomInt, randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import type { PagamentoMp } from './point'
import credito3x from '../fixtures/mercadopago/credito-3x.json'
import creditoEstornado from '../fixtures/mercadopago/credito-estornado.json'
import pixFixture from '../fixtures/mercadopago/pix.json'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url
process.env.CERT_MASTER_KEY ??= 'c'.repeat(64)

let db: typeof import('@/lib/db')['db']
let execRows: typeof import('@/lib/db')['execRows']
let mod: typeof import('./importar')
let cifrar: typeof import('@/lib/cripto')['cifrar']
let RecusaUsuario: typeof import('@/lib/resultado-action')['RecusaUsuario']
let ErroMercadoPago: typeof import('./cliente')['ErroMercadoPago']

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  mod = await import('./importar')
  ;({ cifrar } = await import('@/lib/cripto'))
  ;({ RecusaUsuario } = await import('@/lib/resultado-action'))
  ;({ ErroMercadoPago } = await import('./cliente'))
})
after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})


const TOKEN = 'TEST-token-do-grupo'

async function semearConta(nome: string, { comToken = true } = {}) {
  const suf = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'MPIMP', nome: `${nome} ${suf}`, cnpj: suf })
  const usuarioId = await semearUsuario(db, base, { papel: 'aux_adm' })
  const [modelo] = await execRows(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'MPIMP ' + suf}, 'autopropelido', '1000', 'hub', '32') returning id`)
  if (comToken) {
    await db.execute(sql`update grupos set mp_access_token = ${cifrar(TOKEN)}, mp_user_id = ${'mpuser-' + suf}
      where id = ${base.grupoId}`)
  }
  return { ...base, suf, usuarioId, modeloId: modelo.id as string }
}
type Conta = Awaited<ReturnType<typeof semearConta>>

// A fixture aprova em 2026-11-10 (Brasília); a venda é do mesmo dia.
async function semearVendaMoto(c: Conta, pagamentos: Record<string, unknown>[]) {
  const [moto] = await execRows(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
  const [pedido] = await execRows(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${c.lojaId}, ${c.usuarioId}) returning id`)
  const [venda] = await execRows(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, pagamentos, data_venda)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.usuarioId}, ${c.usuarioId}, 'Cliente sintético', '52998224725', 1000, 'cartao_credito',
      ${JSON.stringify(pagamentos)}::jsonb, ${'2026-11-10 12:00:00-03'}::timestamptz) returning id`)
  return venda.id as string
}
const pagamentoDaFixture = [{ tipo: 'cartao_credito', valor: 900, parcelas: 3 }]

// Ids únicos por cenário: transacao_id do Pix é único no sistema todo e os arquivos rodam em paralelo.
const novoId = () => randomInt(2_000_000_000, 2 ** 47)
const pg = (f: unknown, o: Partial<PagamentoMp> = {}): PagamentoMp => ({ ...(f as PagamentoMp), ...o })

const AGORA = new Date('2026-11-12T12:00:00.000Z')
const buscarFixo = (pagamentos: PagamentoMp[]) => async () => pagamentos

async function cartoesDoGrupo(grupoId: string) {
  return execRows(sql`select nsu, status, conciliado, venda_id from conciliacoes_cartao
    where grupo_id = ${grupoId} and operadora = 'mercadopago' order by nsu`)
}
async function pixPorTransacao(transacaoId: string) {
  return execRows(sql`select grupo_id, conta_id, banco, tipo_operacao, valor, pagador_nome, status, venda_id
    from pix_recebimentos_mcp where transacao_id = ${transacaoId}`)
}

test('grava cartão e casa com a venda do grupo', async () => {
  const a = await semearConta('A')
  const vendaId = await semearVendaMoto(a, pagamentoDaFixture)
  const id = novoId()
  let chamada: { token: string; inicio: Date; fim: Date } | undefined
  const r = await mod.importarMercadoPagoDoGrupo(a.grupoId, {
    agora: AGORA,
    buscar: async (token, p) => { chamada = { token, ...p }; return [pg(credito3x, { id })] },
  })
  assert.deepEqual(r, { importadas: 1, duplicadas: 0, conciliadas: 1, pixNovos: 0, estornos: 0, ignorados: 0 })
  assert.equal(chamada?.token, TOKEN)
  assert.equal(chamada?.fim.toISOString(), AGORA.toISOString())
  assert.equal(chamada?.inicio.toISOString(), '2026-11-05T12:00:00.000Z')
  const [linha] = await cartoesDoGrupo(a.grupoId)
  assert.equal(linha.nsu, String(id))
  assert.equal(linha.venda_id, vendaId)
  assert.equal(linha.conciliado, true)
})

test('segunda rodada não duplica nem desfaz vínculo', async () => {
  const a = await semearConta('A')
  const vendaId = await semearVendaMoto(a, pagamentoDaFixture)
  const pix = novoId()
  const pagamentos = [pg(credito3x, { id: novoId() }), pg(pixFixture, { id: pix })]
  await mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: buscarFixo(pagamentos) })

  const r = await mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: buscarFixo(pagamentos) })
  assert.deepEqual(r, { importadas: 0, duplicadas: 1, conciliadas: 0, pixNovos: 0, estornos: 0, ignorados: 0 })
  const cartoes = await cartoesDoGrupo(a.grupoId)
  assert.equal(cartoes.length, 1)
  assert.equal(cartoes[0].venda_id, vendaId)
  assert.equal((await pixPorTransacao(`mp-${pix}`)).length, 1)
})

test('isolamento: grupo B não casa com venda do grupo A nem sobrescreve Pix de A', async () => {
  const a = await semearConta('A')
  const b = await semearConta('B')
  await semearVendaMoto(a, [{ ...pagamentoDaFixture[0], autorizacao: '123456' }])
  const pixId = novoId()
  // O Pix já está em A, sem nome do pagador.
  await mod.importarMercadoPagoDoGrupo(a.grupoId, {
    agora: AGORA, buscar: buscarFixo([pg(pixFixture, { id: pixId, payer: {} })]),
  })
  const antes = await pixPorTransacao(`mp-${pixId}`)
  assert.equal(antes.length, 1)
  assert.equal(antes[0].grupo_id, a.grupoId)
  assert.equal(antes[0].pagador_nome, null)

  const r = await mod.importarMercadoPagoDoGrupo(b.grupoId, {
    agora: AGORA, buscar: buscarFixo([pg(credito3x, { id: novoId() }), pg(pixFixture, { id: pixId })]),
  })
  assert.deepEqual(r, { importadas: 1, duplicadas: 0, conciliadas: 0, pixNovos: 0, estornos: 0, ignorados: 0 })
  const [cartaoB] = await cartoesDoGrupo(b.grupoId)
  assert.equal(cartaoB.venda_id, null)
  assert.equal(cartaoB.conciliado, false)
  assert.deepEqual(await pixPorTransacao(`mp-${pixId}`), antes)
})

test('estorno de cartão marca estornado, conciliado false e mantém venda_id', async () => {
  const a = await semearConta('A')
  const vendaId = await semearVendaMoto(a, [{ tipo: 'cartao_credito', valor: 200, parcelas: 1 }])
  const id = novoId()
  const aprovado = pg(creditoEstornado, { id, status: 'approved', status_detail: 'accredited', transaction_amount_refunded: 0 })
  await mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: buscarFixo([aprovado]) })
  assert.equal((await cartoesDoGrupo(a.grupoId))[0].venda_id, vendaId)

  const r = await mod.importarMercadoPagoDoGrupo(a.grupoId, {
    agora: AGORA, buscar: buscarFixo([pg(creditoEstornado, { id }), pg(creditoEstornado, { id: novoId() })]),
  })
  // O segundo estorno nunca foi aprovado aqui: não há linha e não conta.
  assert.deepEqual(r, { importadas: 0, duplicadas: 0, conciliadas: 0, pixNovos: 0, estornos: 1, ignorados: 0 })
  const cartoes = await cartoesDoGrupo(a.grupoId)
  assert.equal(cartoes.length, 1)
  assert.equal(cartoes[0].status, 'estornado')
  assert.equal(cartoes[0].conciliado, false)
  assert.equal(cartoes[0].venda_id, vendaId)
})

test('estorno de Pix marca status estornado e mantém venda_id', async () => {
  const a = await semearConta('A')
  const vendaId = await semearVendaMoto(a, pagamentoDaFixture)
  const id = novoId()
  const r1 = await mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: buscarFixo([pg(pixFixture, { id })]) })
  assert.equal(r1.pixNovos, 1)
  const [novo] = await pixPorTransacao(`mp-${id}`)
  assert.equal(novo.conta_id, `mpuser-${a.suf}`)
  assert.equal(novo.banco, 'Mercado Pago')
  assert.equal(novo.tipo_operacao, 'PIX')
  assert.equal(novo.status, 'aprovado')
  await db.execute(sql`update pix_recebimentos_mcp set venda_id = ${vendaId}
    where grupo_id = ${a.grupoId} and transacao_id = ${`mp-${id}`}`)

  const r2 = await mod.importarMercadoPagoDoGrupo(a.grupoId, {
    agora: AGORA, buscar: buscarFixo([pg(pixFixture, { id, status: 'refunded', status_detail: 'refunded' })]),
  })
  assert.equal(r2.estornos, 1)
  const [linha] = await pixPorTransacao(`mp-${id}`)
  assert.equal(linha.status, 'estornado')
  assert.equal(linha.venda_id, vendaId)
})

test('sem credencial recusa', async () => {
  const a = await semearConta('A', { comToken: false })
  let chamou = false
  await assert.rejects(
    mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: async () => { chamou = true; return [] } }),
    (e: unknown) => e instanceof RecusaUsuario && e.message === 'Este grupo não tem credencial do Mercado Pago.',
  )
  assert.equal(chamou, false)
  const ids = (await mod.gruposComMercadoPago()).map(g => g.id)
  assert.equal(ids.includes(a.grupoId), false)
})

test('401 não grava nada', async () => {
  const a = await semearConta('A')
  await semearVendaMoto(a, pagamentoDaFixture)
  assert.equal((await mod.gruposComMercadoPago()).some(g => g.id === a.grupoId), true)
  await assert.rejects(
    mod.importarMercadoPagoDoGrupo(a.grupoId, {
      agora: AGORA,
      buscar: async () => { throw new ErroMercadoPago('Credencial do Mercado Pago recusada (HTTP 401).', 401) },
    }),
    (e: unknown) => e instanceof ErroMercadoPago && e.status === 401,
  )
  assert.equal((await cartoesDoGrupo(a.grupoId)).length, 0)
  const [{ n }] = await execRows(sql`select count(*)::int as n from pix_recebimentos_mcp where grupo_id = ${a.grupoId}`)
  assert.equal(n, 0)
})

test('isolamento: estorno importado em B não mexe no cartão de A', async () => {
  const a = await semearConta('A')
  const b = await semearConta('B')
  const vendaId = await semearVendaMoto(a, [{ tipo: 'cartao_credito', valor: 200, parcelas: 1 }])
  const id = novoId()
  const aprovado = pg(creditoEstornado, { id, status: 'approved', status_detail: 'accredited', transaction_amount_refunded: 0 })
  await mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: buscarFixo([aprovado]) })
  const antes = await cartoesDoGrupo(a.grupoId)
  assert.equal(antes[0].venda_id, vendaId)
  assert.equal(antes[0].conciliado, true)

  const r = await mod.importarMercadoPagoDoGrupo(b.grupoId, { agora: AGORA, buscar: buscarFixo([pg(creditoEstornado, { id })]) })
  assert.equal(r.estornos, 0)
  assert.deepEqual(await cartoesDoGrupo(a.grupoId), antes)
  assert.equal(antes[0].status, 'aprovado')
  assert.equal((await cartoesDoGrupo(b.grupoId)).length, 0)
})

test('isolamento: o mesmo nsu em A e em B vira uma linha em cada grupo, sem duplicada', async () => {
  const a = await semearConta('A')
  const b = await semearConta('B')
  const pagamento = pg(credito3x, { id: novoId() })
  const ra = await mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: buscarFixo([pagamento]) })
  const rb = await mod.importarMercadoPagoDoGrupo(b.grupoId, { agora: AGORA, buscar: buscarFixo([pagamento]) })
  assert.equal(ra.importadas, 1); assert.equal(ra.duplicadas, 0)
  assert.equal(rb.importadas, 1); assert.equal(rb.duplicadas, 0)
  const [la] = await cartoesDoGrupo(a.grupoId)
  const [lb] = await cartoesDoGrupo(b.grupoId)
  assert.equal(la.nsu, String(pagamento.id))
  assert.equal(lb.nsu, String(pagamento.id))
  assert.equal((await cartoesDoGrupo(a.grupoId)).length, 1)
  assert.equal((await cartoesDoGrupo(b.grupoId)).length, 1)
})

test('estorno parcial depois da 1ª importação atualiza raw_data.estornado sem mexer no vínculo', async () => {
  const a = await semearConta('A')
  const b = await semearConta('B')
  const vendaId = await semearVendaMoto(a, pagamentoDaFixture)
  const id = novoId()
  const estornadoDe = async (grupoId: string) => (await execRows(sql`select raw_data->>'estornado' as estornado, status, conciliado, venda_id
    from conciliacoes_cartao where grupo_id = ${grupoId} and operadora = 'mercadopago' and nsu = ${String(id)}`))[0]

  await mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: buscarFixo([pg(credito3x, { id })]) })
  await mod.importarMercadoPagoDoGrupo(b.grupoId, { agora: AGORA, buscar: buscarFixo([pg(credito3x, { id })]) })
  assert.equal(Number((await estornadoDe(a.grupoId)).estornado), 0)

  const parcial = pg(credito3x, { id, status_detail: 'partially_refunded', transaction_amount_refunded: 150 })
  const r = await mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: buscarFixo([parcial]) })
  // Segue contada como duplicada: a linha não é nova.
  assert.deepEqual(r, { importadas: 0, duplicadas: 1, conciliadas: 0, pixNovos: 0, estornos: 0, ignorados: 0 })
  const depois = await estornadoDe(a.grupoId)
  assert.equal(Number(depois.estornado), 150)
  assert.equal(depois.status, 'aprovado')
  assert.equal(depois.conciliado, true)
  assert.equal(depois.venda_id, vendaId)
  // Isolamento: a linha do mesmo nsu em B não muda.
  assert.equal(Number((await estornadoDe(b.grupoId)).estornado), 0)

  // Rodar de novo com o mesmo valor não muda nada.
  await mod.importarMercadoPagoDoGrupo(a.grupoId, { agora: AGORA, buscar: buscarFixo([parcial]) })
  assert.deepEqual(await estornadoDe(a.grupoId), depois)
})
