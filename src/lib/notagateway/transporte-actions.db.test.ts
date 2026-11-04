import { after, afterEach, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import { RENAVE_COMPLETO_FATURAMENTO_DIRETO } from '@/test/renave-completo'
import type { DadosTransporte } from './transporte'
import type { montarNfeVendaMoto } from './payload'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url
process.env.CERT_MASTER_KEY = 'a'.repeat(64)

type Db = typeof import('@/lib/db')
type Payload = ReturnType<typeof montarNfeVendaMoto>
let db: Db['db']
let actions: typeof import('@/app/(dashboard)/vendas/nfe-propria-actions')
let user: { id: string; papel: string; lojaId: string; contaId: string; gruposAcesso: string[] }
const authMock = mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => user } })
const cacheMock = mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })
before(async () => {
  ;({ db } = await import('@/lib/db'))
  actions = await import('@/app/(dashboard)/vendas/nfe-propria-actions')
})
afterEach(() => mock.restoreAll())
after(async () => {
  authMock.restore()
  cacheMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const renave = RENAVE_COMPLETO_FATURAMENTO_DIRETO
const transport: DadosTransporte = {
  modalidade: 'TransporteProprioPorContaDoDestinatario',
  enderecoEntrega: { tipoPessoaDestinatario: 'F', cpfCnpjDestinatario: '35281765043',
    logradouro: 'Rua Entrega', numero: '20', bairro: 'Centro', cidade: '4106902', uf: 'PR' },
}
const expectedTransport = {
  frete: { modalidade: 'TransporteProprioPorContaDoDestinatario' },
  enderecoEntrega: { tipoPessoaDestinatario: 'F', cpfCnpjDestinatario: '35281765043', pais: null,
    logradouro: 'Rua Entrega', numero: '20', bairro: 'Centro', cidade: '4106902', uf: 'PR' },
}

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows
}
const insertId = async (query: ReturnType<typeof sql>) => (await rows<{ id: string }>(query))[0].id

async function fixture(rejected = false, rejectedPayload: unknown = {}) {
  const suffix = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'TR650', nome: suffix, cnpj: suffix })
  const id = await semearUsuario(db, base, { papel: 'aux_adm', comConta: true })
  const accountUser = { id, papel: 'aux_adm', lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [] }
  const { cifrar } = await import('@/lib/cripto')
  await db.execute(sql`insert into notagateway_config (grupo_id, token, empresa_id, ambiente)
    values (${base.grupoId}, ${cifrar('credencial-sintetica')}, 'empresa-sintetica-650', 'Homologacao')`)
  await db.execute(sql`insert into regras_fiscais_saida (grupo_id, natureza_operacao, cfop_interno, cst_icms_interno,
    cfop_interestadual, cst_icms_interestadual, cst_pis, cst_cofins)
    values (${base.grupoId}, 'Venda', '5102', '00', '6102', '00', '49', '49')`)
  const modelId = await insertId(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('Teste', ${suffix}, 'ciclomotor', '1000W', 'Brushless', '45') returning id`)
  const motoId = await insertId(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status)
    values (${suffix}, ${modelId}, ${base.lojaId}, 'PRETA', '1', 'vendida') returning id`)
  await db.execute(sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, x_prod, origem)
    values (${motoId}, '00000000000000', '87116000', 'DESCRICAO LITERAL TESTE', '0')`)
  const orderId = await insertId(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${motoId}, ${base.lojaId}, ${id}) returning id`)
  const [sale] = await rows<{ id: string; numero: number }>(sql`insert into vendas
    (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf,
      cliente_logradouro, cliente_numero, cliente_bairro, cliente_cidade, cliente_estado, cliente_cep,
      valor, forma_pagamento, pagamentos, nf_liberada_em)
    values (${orderId}, ${motoId}, ${base.lojaId}, ${id}, ${id}, 'Comprador sintético', '35281765043',
      'Rua Comprador', '10', 'Centro', 'Varginha', 'MG', '37000000', 1000, 'dinheiro',
      '[{"tipo":"dinheiro","valor":1000}]'::jsonb, now()) returning id, numero`)
  const externalId = `mova-homolog-${sale.numero}-1`
  const noteId = rejected ? await insertId(sql`insert into notas_fiscais_saida
    (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, numero, serie, motivo_status, payload)
    values (${sale.id}, ${sale.numero}, ${base.grupoId}, ${externalId}, 'Homologacao', 'Negada', '650', '1',
      '478 - UF de entrega ausente', ${JSON.stringify(rejectedPayload)}::jsonb) returning id`) : null
  return { ...base, user: accountUser, motoId, saleId: sale.id, externalId, noteId }
}

function network(f: Awaited<ReturnType<typeof fixture>>) {
  const requests: { method: string; path: string }[] = []
  const payloads: Payload[] = []
  mock.method(globalThis, 'fetch', async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    assert.equal(url.origin, 'https://api.notagateway.com.br')
    const path = url.pathname
    const method = init?.method ?? 'GET'
    requests.push({ method, path })
    if (method === 'POST' && path === '/v2/empresas/empresa-sintetica-650/nf-e') {
      payloads.push(JSON.parse(String(init?.body)))
      return new Response(null, { status: 202 })
    }
    if (method === 'GET' && path === '/v2/empresas/empresa-sintetica-650') return Response.json({ endereco: { uf: 'MG' } })
    if (method === 'GET' && path === `/v2/empresas/empresa-sintetica-650/nf-e/${f.externalId}`) {
      if (!payloads.length && !f.noteId) return Response.json([{ codigo: 'NFe0001' }], { status: 400 })
      return Response.json({ status: payloads.length ? 'Autorizada' : 'Negada', numero: '650', serie: '1',
        motivoStatus: payloads.length ? null : '478 - UF de entrega ausente', dataAutorizacao: payloads.length ? '2026-11-04T12:00:00Z' : null })
    }
    throw new Error('Requisição externa não prevista no teste')
  })
  return { requests, payloads }
}

async function snapshot(f: Awaited<ReturnType<typeof fixture>>) {
  return {
    notes: await rows(sql`select id, id_externo, numero, status, payload from notas_fiscais_saida where venda_id = ${f.saleId}`),
    sales: await rows(sql`select cliente_nome, cliente_logradouro, nota_fiscal_saida from vendas where id = ${f.saleId}`),
    renave: await rows(sql`select * from motos_renave where moto_id = ${f.motoId}`),
    fiscal: await rows(sql`select * from motos_fiscal where moto_id = ${f.motoId}`),
  }
}

test('action inicial persiste e serializa modalidade 4 e entrega; homologação não fatura', async () => {
  const f = await fixture()
  user = f.user
  const net = network(f)
  const result = await actions.transmitirNfePropriaAction(f.motoId, renave, transport)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(net.payloads.length, 1)
  assert.deepEqual(net.payloads[0].transporte, expectedTransport)
  assert.equal(net.payloads[0].itens[0].veiculoNovo?.tipoOperacao, 'FaturamentoDiretoConsumidorFinal')
  assert.equal(net.payloads[0].cliente.endereco.logradouro, 'Rua Comprador')
  const notes = await rows<{ payload: Payload }>(sql`select payload from notas_fiscais_saida where venda_id = ${f.saleId}`)
  assert.equal(notes.length, 1)
  assert.deepEqual(notes[0].payload, net.payloads[0])
  assert.deepEqual((await snapshot(f)).sales, [{ cliente_nome: 'Comprador sintético', cliente_logradouro: 'Rua Comprador', nota_fiscal_saida: null }])
})

const semUf: DadosTransporte = { ...transport, enderecoEntrega: { ...transport.enderecoEntrega!, uf: '' } }
const numeroDeNotas = async (f: Awaited<ReturnType<typeof fixture>>) => (await snapshot(f)).notes.length

test('transmitir com entrega sem UF: recusa antes de gravar a RENAVE, de criar a nota e de chamar a NG', async () => {
  const f = await fixture()
  user = f.user
  const net = network(f)
  const antes = await snapshot(f)
  const result = await actions.transmitirNfePropriaAction(f.motoId, renave, semUf)
  assert.equal(result.ok, false)
  assert.match(result.ok ? '' : result.error, /UF/)
  assert.deepEqual(net.requests, [])
  assert.deepEqual(await snapshot(f), antes)
})

test('transmitir ciclomotor sem nenhum transporte também não chega à NG', async () => {
  const f = await fixture()
  user = f.user
  const net = network(f)
  const result = await actions.transmitirNfePropriaAction(f.motoId, renave)
  assert.deepEqual(result, { ok: false, error: 'Selecione a modalidade do frete.' })
  assert.deepEqual(net.requests, [])
  assert.equal(await numeroDeNotas(f), 0)
})

test('salvar e reenviar leva o transporte no mesmo id, na mesma linha e com o mesmo número', async () => {
  const f = await fixture(true)
  user = f.user
  const net = network(f)
  const result = await actions.corrigirEReenviarNfAction(f.motoId, { moto: { ncm: '87116000', cest: '' } }, renave, transport)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(net.payloads.map(p => p.transporte), [expectedTransport])
  assert.equal(net.payloads[0].id, f.externalId)
  const notes = (await snapshot(f)).notes as { id: string; id_externo: string; numero: string; payload: Payload }[]
  assert.equal(notes.length, 1)
  assert.equal(notes[0].id, f.noteId)
  assert.equal(notes[0].id_externo, f.externalId)
  assert.equal(notes[0].numero, '650')
  assert.deepEqual(notes[0].payload.transporte, expectedTransport)
})

test('salvar e reenviar com entrega sem UF não grava a correção nem muda a nota recusada', async () => {
  const f = await fixture(true)
  user = f.user
  const net = network(f)
  await db.execute(sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, x_prod, origem) values (${f.motoId}, 'X', '87116000', 'X', '0') on conflict (moto_id) do update set ncm = '87116000'`)
  const antes = await snapshot(f)
  const result = await actions.corrigirEReenviarNfAction(f.motoId, { moto: { ncm: '87119000', cest: '' } }, renave, semUf)
  assert.equal(result.ok, false)
  assert.deepEqual(net.requests, [])
  assert.deepEqual(await snapshot(f), antes)
})

test('Conta B recebe a mesma resposta de moto inexistente e nada é gravado nem enviado para a Conta A', async () => {
  const a = await fixture(true)
  const b = await fixture()
  user = b.user
  const net = network(a)
  const inexistente = randomUUID()
  const antes = await snapshot(a)
  const transmitir = await actions.transmitirNfePropriaAction(a.motoId, renave, transport)
  const corrigir = await actions.corrigirEReenviarNfAction(a.motoId, { moto: { ncm: '87119000', cest: '' } }, renave, transport)
  const previa = await actions.previsualizarNfePropriaAction(a.motoId)
  assert.deepEqual(transmitir, await actions.transmitirNfePropriaAction(inexistente, renave, transport))
  assert.deepEqual(corrigir, await actions.corrigirEReenviarNfAction(inexistente, { moto: { ncm: '87119000', cest: '' } }, renave, transport))
  assert.deepEqual(previa, await actions.previsualizarNfePropriaAction(inexistente))
  assert.equal(transmitir.ok, false)
  assert.deepEqual(net.requests, [])
  assert.deepEqual(await snapshot(a), antes)
})

test('reabrir a recusa devolve o transporte enviado; recusa antiga sem transporte não ganha padrão', async () => {
  const comTransporte = await fixture(true, { transporte: expectedTransport })
  user = comTransporte.user
  network(comTransporte)
  const previa = await actions.previsualizarNfePropriaAction(comTransporte.motoId)
  assert.equal(previa.ok, true, JSON.stringify(previa))
  assert.deepEqual(previa.ok ? previa.transporteAnterior : 'falhou', transport)

  const antiga = await fixture(true)
  user = antiga.user
  network(antiga)
  const antigaPrevia = await actions.previsualizarNfePropriaAction(antiga.motoId)
  assert.equal(antigaPrevia.ok ? antigaPrevia.transporteAnterior : 'falhou', null)
})

test('tpOp diferente de 2 segue emitindo como antes: sem exigir frete e sem transporte no payload', async () => {
  const f = await fixture()
  user = f.user
  const net = network(f)
  const revenda = { ...renave, tipoOperacao: 'VendaConcessionaria' }
  const result = await actions.transmitirNfePropriaAction(f.motoId, revenda)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(net.payloads.length, 1)
  assert.equal('transporte' in net.payloads[0], false)
  assert.equal(net.payloads[0].itens[0].veiculoNovo?.tipoOperacao, 'VendaConcessionaria')
})

test('tpOp diferente de 2 ignora transporte que a tela mande por engano', async () => {
  const f = await fixture()
  user = f.user
  const net = network(f)
  const result = await actions.transmitirNfePropriaAction(f.motoId, { ...renave, tipoOperacao: 'VendaConcessionaria' }, transport)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal('transporte' in net.payloads[0], false)
})
