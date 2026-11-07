import { after, afterEach, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import { RENAVE_COMPLETO_FATURAMENTO_DIRETO } from '@/test/renave-completo'
import type { DadosTransporte } from './transporte'
import { PENDENCIA_SEM_MODALIDADE, UF_DO_FORMULARIO_DIFERENTE, type EntregaVenda } from './entrega'
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

type Opcoes = { categoria?: string; entrega?: EntregaVenda; ufCliente?: string }

async function fixture(rejected = false, rejectedPayload: unknown = {}, { categoria = 'ciclomotor', entrega, ufCliente = 'MG' }: Opcoes = {}) {
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
  const modelId = await insertId(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('Teste', ${suffix}, ${categoria}, '1000W', 'Brushless', '45') returning id`)
  const motoId = await insertId(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status)
    values (${suffix}, ${modelId}, ${base.lojaId}, 'PRETA', '1', 'vendida') returning id`)
  await db.execute(sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, x_prod, origem)
    values (${motoId}, '00000000000000', '87116000', 'DESCRICAO LITERAL TESTE', '0')`)
  const orderId = await insertId(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${motoId}, ${base.lojaId}, ${id}) returning id`)
  const [sale] = await rows<{ id: string; numero: number }>(sql`insert into vendas
    (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf,
      cliente_logradouro, cliente_numero, cliente_bairro, cliente_cidade, cliente_estado, cliente_cep,
      valor, forma_pagamento, pagamentos, nf_liberada_em, entrega)
    values (${orderId}, ${motoId}, ${base.lojaId}, ${id}, ${id}, 'Comprador sintético', '35281765043',
      'Rua Comprador', '10', 'Centro', 'Varginha', ${ufCliente}, '37000000', 1000, 'dinheiro',
      '[{"tipo":"dinheiro","valor":1000}]'::jsonb, now(), ${entrega ? JSON.stringify(entrega) : null}::jsonb) returning id, numero`)
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

test('recusa gravada com SemTransporte reabre com SemOcorrenciaDeTransporte e o reenvio sai com o nome 4.0 (#723)', async () => {
  const gravado = { transporte: { frete: { modalidade: 'SemTransporte' }, enderecoEntrega: expectedTransport.enderecoEntrega } }
  const f = await fixture(true, gravado)
  user = f.user
  const net = network(f)
  const previa = await actions.previsualizarNfePropriaAction(f.motoId)
  assert.equal(previa.ok, true, JSON.stringify(previa))
  const anterior = previa.ok ? previa.transporteAnterior : null
  assert.deepEqual(anterior, { ...transport, modalidade: 'SemOcorrenciaDeTransporte' })

  const result = await actions.corrigirEReenviarNfAction(f.motoId, { moto: { ncm: '87116000', cest: '' } }, renave, anterior!)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(net.payloads.map(p => p.transporte?.frete.modalidade), ['SemOcorrenciaDeTransporte'])
  const notes = (await snapshot(f)).notes as { id: string; numero: string; payload: Payload }[]
  assert.deepEqual(notes.map(n => [n.id, n.numero, n.payload.transporte?.frete.modalidade]), [[f.noteId, '650', 'SemOcorrenciaDeTransporte']])
})

test('recusa 841: reenviar com o RENAVE editado leva o veículo novo no mesmo id, linha e número (#673)', async () => {
  const f = await fixture(true)
  user = f.user
  const net = network(f)
  const { gravarRenaveDaMoto } = await import('@/lib/renave-da-moto')
  const antigo = { ...renave, tipoCombustivel: '06' }
  assert.deepEqual(await gravarRenaveDaMoto(f.user, f.motoId, antigo, f.user.id), { ok: true })

  const result = await actions.corrigirEReenviarNfAction(f.motoId, { moto: { ncm: '87116000', cest: '' } }, { ...renave, tipoCombustivel: '07' }, transport)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(net.payloads.length, 1)
  assert.equal(net.payloads[0].id, f.externalId)
  assert.equal(net.payloads[0].itens[0].veiculoNovo?.tipoCombustivel, '7')
  const notas = (await snapshot(f)).notes as { id: string; id_externo: string; numero: string; payload: Payload }[]
  assert.equal(notas.length, 1)
  assert.equal(notas[0].id, f.noteId)
  assert.equal(notas[0].numero, '650')
  assert.equal(notas[0].payload.itens[0].veiculoNovo?.tipoCombustivel, '7')
  assert.deepEqual(await rows(sql`select tipo_combustivel from motos_renave where moto_id = ${f.motoId}`), [{ tipo_combustivel: '07' }])
})

test('recusa 841: a Conta B reenviando com RENAVE próprio recebe a resposta de moto inexistente e nada muda na Conta A (#673)', async () => {
  const a = await fixture(true)
  const b = await fixture()
  const { gravarRenaveDaMoto } = await import('@/lib/renave-da-moto')
  await gravarRenaveDaMoto(a.user, a.motoId, { ...renave, tipoCombustivel: '06' }, a.user.id)
  user = b.user
  const net = network(a)
  const antes = await snapshot(a)
  const editado = { ...renave, tipoCombustivel: '07', codigoMarcaModelo: '000009' }
  const correcao = { moto: { ncm: '87116000', cest: '' } }
  const daB = await actions.corrigirEReenviarNfAction(a.motoId, correcao, editado, transport)
  assert.deepEqual(daB, await actions.corrigirEReenviarNfAction(randomUUID(), correcao, editado, transport))
  assert.equal(daB.ok, false)
  assert.deepEqual(net.requests, [])
  assert.deepEqual(await snapshot(a), antes)
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

async function inserirNota(f: Awaited<ReturnType<typeof fixture>>, o: { idExterno: string; status: string; ambiente?: string; motivo?: string | null; depoisDeSegundos?: number }) {
  const [venda] = await rows<{ numero: number }>(sql`select numero from vendas where id = ${f.saleId}`)
  await db.execute(sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, payload, criado_em)
    values (${f.saleId}, ${venda.numero}, ${f.grupoId}, ${o.idExterno}, ${o.ambiente ?? 'Homologacao'}, ${o.status}, ${o.motivo ?? null},
      ${JSON.stringify({ transporte: expectedTransport })}::jsonb, now() + make_interval(secs => ${o.depoisDeSegundos ?? 10}))`)
}
const transporteRecuperado = async (f: Awaited<ReturnType<typeof fixture>>) => {
  user = f.user
  network(f)
  const previa = await actions.previsualizarNfePropriaAction(f.motoId)
  assert.equal(previa.ok, true, JSON.stringify(previa))
  return previa.ok ? previa.transporteAnterior : 'falhou'
}

test('recuperar o transporte ignora recusa de outro ambiente', async () => {
  const f = await fixture()
  await inserirNota(f, { idExterno: 'mova-prod-1', status: 'Negada', ambiente: 'Producao', motivo: '478 - x' })
  assert.equal(await transporteRecuperado(f), null)
})

test('recuperar o transporte ignora recusa antiga quando a última tentativa foi autorizada', async () => {
  const f = await fixture(true, { transporte: expectedTransport })
  await inserirNota(f, { idExterno: `${f.externalId}-b`, status: 'Autorizada' })
  assert.equal(await transporteRecuperado(f), null)
})

test('recuperar o transporte também vale para nota denegada, que abre a mesma tela de recusa', async () => {
  const f = await fixture()
  await inserirNota(f, { idExterno: 'mova-homolog-den-1', status: 'Denegada', motivo: '302 - destinatário irregular' })
  assert.deepEqual(await transporteRecuperado(f), transport)
})

test('código IBGE com 6 dígitos ou com letra bloqueia na action, sem NG e sem gravar', async () => {
  for (const cidade of ['410690', '41069O2']) {
    const f = await fixture()
    user = f.user
    const net = network(f)
    const antes = await snapshot(f)
    const result = await actions.transmitirNfePropriaAction(f.motoId, renave, { ...transport, enderecoEntrega: { ...transport.enderecoEntrega!, cidade } })
    assert.deepEqual(result, { ok: false, error: 'Código IBGE do município deve ter 7 dígitos.' })
    assert.deepEqual(net.requests, [])
    assert.deepEqual(await snapshot(f), antes)
  }
})

test('tipo de pessoa incoerente vindo da tela é corrigido pelo documento antes de ir à NG', async () => {
  const f = await fixture()
  user = f.user
  const net = network(f)
  const result = await actions.transmitirNfePropriaAction(f.motoId, renave, { ...transport, enderecoEntrega: { ...transport.enderecoEntrega!, tipoPessoaDestinatario: 'J' } })
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(net.payloads[0].transporte?.enderecoEntrega?.tipoPessoaDestinatario, 'F')
})

// Entrega da venda (#725): a NF lê a Entrega gravada na venda; emitente MG (Consultar Empresa sintético), cliente de SP.
const RETIRA: EntregaVenda = { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' }
const REVENDA = { ...renave, tipoOperacao: 'VendaConcessionaria' }

test('venda com Entrega "Retira na loja" e cliente de outra UF: prévia e nota dentro do estado, só a modalidade no transporte', async () => {
  const f = await fixture(false, {}, { categoria: 'autopropelido', entrega: RETIRA, ufCliente: 'SP' })
  user = f.user
  const net = network(f)
  const previa = await actions.previsualizarNfePropriaAction(f.motoId)
  assert.ok(previa.ok && previa.resumo, JSON.stringify(previa))
  assert.deepEqual(previa.resumo.operacao, { interestadual: false, motivo: 'retira', ufOrigem: 'MG', ufDestino: 'MG' })
  const result = await actions.transmitirNfePropriaAction(f.motoId)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(net.payloads[0].itens[0].cfop, '5102')
  assert.equal(net.payloads[0].cliente.endereco.uf, 'SP')
  assert.deepEqual(net.payloads[0].transporte, { frete: { modalidade: 'TransporteProprioPorContaDoDestinatario' } })
})

test('ciclomotor com Entrega "Retira na loja" e cliente de outra UF: nota para outro estado, sem endereço de entrega', async () => {
  const f = await fixture(false, {}, { entrega: RETIRA, ufCliente: 'SP' })
  user = f.user
  const net = network(f)
  const result = await actions.transmitirNfePropriaAction(f.motoId, REVENDA)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(net.payloads[0].itens[0].cfop, '6102')
  assert.deepEqual(net.payloads[0].transporte, { frete: { modalidade: 'TransporteProprioPorContaDoDestinatario' } })
})

test('venda com Entrega sem modalidade: prévia lista a pendência e transmitir recusa com a mesma frase, sem nota nem chamada de envio', async () => {
  const f = await fixture(false, {}, { categoria: 'autopropelido', entrega: { modo: 'retira', modalidade: '' }, ufCliente: 'SP' })
  user = f.user
  const net = network(f)
  const previa = await actions.previsualizarNfePropriaAction(f.motoId)
  assert.ok(previa.ok)
  assert.deepEqual(previa.pendencias, [PENDENCIA_SEM_MODALIDADE])
  assert.deepEqual(await actions.transmitirNfePropriaAction(f.motoId), { ok: false, error: PENDENCIA_SEM_MODALIDADE })
  assert.equal(await numeroDeNotas(f), 0)
  assert.equal(net.requests.filter(r => r.method === 'POST').length, 0)
})

// "Entregar" (#726): emitente MG, cliente de MG, entrega no PR. Quem recebe vazio = o comprador da venda.
const ENTREGAR_PR: EntregaVenda = {
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente',
  endereco: { cep: '80010000', logradouro: 'Rua Entrega', numero: '20', complemento: '', bairro: 'Centro', cidade: '4106902', nomeCidade: 'Curitiba', uf: 'PR' },
  recebe: null,
}

test('venda "Entregar" em outra UF com cliente da UF da loja: prévia e nota para outro estado, enderecoEntrega com o comprador', async () => {
  const f = await fixture(false, {}, { categoria: 'autopropelido', entrega: ENTREGAR_PR })
  user = f.user
  const net = network(f)
  const previa = await actions.previsualizarNfePropriaAction(f.motoId)
  assert.ok(previa.ok && previa.resumo, JSON.stringify(previa))
  assert.deepEqual(previa.resumo.operacao, { interestadual: true, motivo: 'entregar', ufOrigem: 'MG', ufDestino: 'PR' })
  const result = await actions.transmitirNfePropriaAction(f.motoId)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(net.payloads[0].itens[0].cfop, '6102')
  assert.equal(net.payloads[0].cliente.endereco.uf, 'MG')
  assert.equal(net.payloads[0].cliente.nome, 'COMPRADOR SINTÉTICO')
  assert.deepEqual(net.payloads[0].transporte, {
    frete: { modalidade: 'TransporteProprioPorContaDoRemetente' },
    enderecoEntrega: { ...expectedTransport.enderecoEntrega, nomeDestinatario: net.payloads[0].cliente.nome, cep: '80010000' },
  })
})

test('venda "Entregar" com outra pessoa recebendo: enderecoEntrega com nome, documento e tipo de pessoa dela', async () => {
  const entrega = { ...ENTREGAR_PR, recebe: { nome: 'Empresa que recebe', cpfCnpj: '11222333000181' } } as EntregaVenda
  const f = await fixture(false, {}, { categoria: 'autopropelido', entrega })
  user = f.user
  const net = network(f)
  const result = await actions.transmitirNfePropriaAction(f.motoId)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.deepEqual(net.payloads[0].transporte?.enderecoEntrega, {
    ...expectedTransport.enderecoEntrega, tipoPessoaDestinatario: 'J', cpfCnpjDestinatario: '11222333000181',
    nomeDestinatario: 'Empresa que recebe', cep: '80010000',
  })
})

test('faturamento direto de venda "Entregar" com a UF do formulário diferente da Entrega: transmitir recusa, sem nota nem envio', async () => {
  const f = await fixture(false, {}, { entrega: ENTREGAR_PR })
  user = f.user
  const net = network(f)
  const formularioMg: DadosTransporte = { ...transport, enderecoEntrega: { ...transport.enderecoEntrega!, cidade: '3170701', uf: 'MG' } }
  assert.deepEqual(await actions.transmitirNfePropriaAction(f.motoId, renave, formularioMg), { ok: false, error: UF_DO_FORMULARIO_DIFERENTE })
  assert.equal(await numeroDeNotas(f), 0)
  assert.equal(net.requests.filter(r => r.method === 'POST').length, 0)
})

test('faturamento direto de venda "Entregar" com a mesma UF no formulário: a nota sai', async () => {
  const f = await fixture(false, {}, { entrega: ENTREGAR_PR })
  user = f.user
  const net = network(f)
  const result = await actions.transmitirNfePropriaAction(f.motoId, renave, transport)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(net.payloads[0].transporte?.enderecoEntrega?.uf, 'PR')
})

test('corrigir e reenviar de venda "Entregar" com a UF do formulário diferente: recusa antes de gravar a correção', async () => {
  const f = await fixture(true, {}, { entrega: ENTREGAR_PR })
  user = f.user
  const net = network(f)
  await db.execute(sql`insert into motos_fiscal (moto_id, emitente_cnpj, ncm, x_prod, origem) values (${f.motoId}, 'X', '87116000', 'X', '0') on conflict (moto_id) do update set ncm = '87116000'`)
  const antes = await snapshot(f)
  const formularioMg: DadosTransporte = { ...transport, enderecoEntrega: { ...transport.enderecoEntrega!, cidade: '3170701', uf: 'MG' } }
  const result = await actions.corrigirEReenviarNfAction(f.motoId, { moto: { ncm: '87119000', cest: '' } }, renave, formularioMg)
  assert.deepEqual(result, { ok: false, error: UF_DO_FORMULARIO_DIFERENTE })
  assert.deepEqual(net.requests, [])
  assert.deepEqual(await snapshot(f), antes)
})

test('venda "Entregar" ao próprio comprador com nome acima de 60 caracteres: a prévia lista a pendência e transmitir recusa', async () => {
  const f = await fixture(false, {}, { categoria: 'autopropelido', entrega: ENTREGAR_PR })
  await db.execute(sql`update vendas set cliente_nome = ${'Comprador '.repeat(7)} where id = ${f.saleId}`)
  user = f.user
  const net = network(f)
  const frase = 'O nome do cliente passa de 60 caracteres, o limite da nota para quem recebe a entrega. Corrija o nome do cliente antes de emitir.'
  const previa = await actions.previsualizarNfePropriaAction(f.motoId)
  assert.ok(previa.ok)
  assert.deepEqual(previa.pendencias, [frase])
  assert.deepEqual(await actions.transmitirNfePropriaAction(f.motoId), { ok: false, error: frase })
  assert.equal(net.requests.filter(r => r.method === 'POST').length, 0)
})
