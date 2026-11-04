import { after, afterEach, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import type { DadosRenave } from './veiculo'
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

const renave: DadosRenave = {
  chassi: '9C2ABC12345678901', tipoOperacao: 'FaturamentoDiretoConsumidorFinal',
  corCodigo: '11', corDescricao: 'PRETA', corDenatran: 'Preta', potenciaMotor: '1000', unidadePotencia: 'W',
  cilindradas: '0', pesoLiquido: '0.0850', pesoBruto: '0.2350', numeroSerie: '45678901',
  tipoCombustivel: '07', numeroMotor: 'TESTE650', capacidadeMaximaTracao: '0', distanciaEixos: '1300',
  anoModelo: '2027', anoFabricacao: '2026', tipoPintura: 'S', tipoVeiculo: '02', especie: 'Passageiro',
  condicaoVin: 'Normal', condicao: 'Acabado', codigoMarcaModelo: '012345', lotacao: '2', restricao: 'NaoHa',
}
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

async function fixture(rejected = false) {
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
  const modelId = await insertId(sql`insert into modelos (marca, modelo, categoria) values ('Teste', ${suffix}, 'ciclomotor') returning id`)
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
      '478 - UF de entrega ausente', '{}'::jsonb) returning id`) : null
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
