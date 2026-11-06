// Teste de banco (#690): consultar, cancelar e descartar uma NF de saída cuja venda não existe
// mais. Postgres descartável, como transporte-actions.db.test.ts; mock só no login e na rede.
import { after, afterEach, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import { recusaSemVenda } from '@/lib/notas-emitidas'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url
process.env.CERT_MASTER_KEY = 'a'.repeat(64)

type Db = typeof import('@/lib/db')
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

async function rows<T>(query: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows
}
const insertId = async (query: ReturnType<typeof sql>) => (await rows<{ id: string }>(query))[0].id

// Fora de transação, porque as actions usam o db: o sufixo aleatório isola as linhas de cada rodada.
async function contaComOperador() {
  const suffix = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'SV690', nome: suffix, cnpj: suffix })
  const id = await semearUsuario(db, base, { papel: 'aux_adm', comConta: true })
  return { ...base, suffix, user: { id, papel: 'aux_adm', lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [] } }
}

/** Três notas da mesma venda, uma para cada ação, e a venda apagada depois (como Cancelar venda e Remover moto). */
async function notasSemVenda() {
  const a = await contaComOperador()
  const { cifrar } = await import('@/lib/cripto')
  await db.execute(sql`insert into notagateway_config (grupo_id, token, empresa_id, ambiente)
    values (${a.grupoId}, ${cifrar('credencial-sintetica')}, 'empresa-sintetica-690', 'Homologacao')`)
  const modelId = await insertId(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('Teste', ${a.suffix}, 'ciclomotor', '1000W', 'Brushless', '45') returning id`)
  const motoId = await insertId(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status)
    values (${a.suffix}, ${modelId}, ${a.lojaId}, 'PRETA', '1', 'vendida') returning id`)
  const orderId = await insertId(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${motoId}, ${a.lojaId}, ${a.user.id}) returning id`)
  const [venda] = await rows<{ id: string; numero: number }>(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${orderId}, ${motoId}, ${a.lojaId}, ${a.user.id}, ${a.user.id}, 'Comprador sintético', '35281765043', 1000, 'dinheiro') returning id, numero`)
  const nota = (status: string, extra: ReturnType<typeof sql>) => insertId(sql`insert into notas_fiscais_saida
    (venda_id, grupo_id, id_externo, ambiente, status, numero, serie, payload, data_autorizacao, criado_em)
    values (${venda.id}, ${a.grupoId}, ${randomUUID()}, 'Homologacao', ${status}, '690', '1', '{}'::jsonb, ${extra}) returning id`)
  const processando = await nota('Processando', sql`null, now()`)
  const autorizada = await nota('Autorizada', sql`now(), now()`)
  // Parada em Enviando há uma hora: elegível ao descarte se a venda existisse.
  const enviando = await nota('Enviando', sql`null, now() - interval '1 hour'`)
  await db.execute(sql`delete from vendas where id = ${venda.id}`)
  return { a, vendaNumero: venda.numero, processando, autorizada, enviando }
}

function semRede() {
  const chamadas: string[] = []
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    chamadas.push(String(input))
    return new Response(null, { status: 500 })
  })
  return chamadas
}

test('consultar, cancelar e descartar nota cuja venda não existe mais recusam com a frase, sem ir à Nota Gateway (#690)', async () => {
  const f = await notasSemVenda()
  const chamadas = semRede()
  user = f.a.user
  const recusa = { ok: false, error: recusaSemVenda(f.vendaNumero) }
  assert.deepEqual(await actions.consultarNfePropriaAction(f.processando), recusa)
  assert.deepEqual(await actions.cancelarNfePropriaAction(f.autorizada, 'venda desfeita'), recusa)
  assert.deepEqual(await actions.descartarTentativaAction(f.enviando), recusa)
  assert.deepEqual(chamadas, [])
  const [{ total }] = await rows<{ total: number }>(sql`select count(*)::int as total from notas_fiscais_saida
    where id in (${f.processando}, ${f.autorizada}, ${f.enviando}) and venda_id is null and cancelamento_motivo is null and status <> 'Descartada'`)
  assert.equal(total, 3, 'as três notas ficam como estavam')
})

test('nota sem venda da Conta A: a Conta B recebe "Nota não encontrada", igual a um id inexistente (#690)', async () => {
  const f = await notasSemVenda()
  const b = await contaComOperador()
  const chamadas = semRede()
  user = b.user
  const naoEncontrada = { ok: false, error: 'Nota não encontrada' }
  assert.deepEqual(await actions.consultarNfePropriaAction(f.processando), naoEncontrada)
  assert.deepEqual(await actions.consultarNfePropriaAction(randomUUID()), naoEncontrada)
  assert.deepEqual(await actions.cancelarNfePropriaAction(f.autorizada, 'venda desfeita'), naoEncontrada)
  assert.deepEqual(await actions.descartarTentativaAction(f.enviando), naoEncontrada)
  assert.deepEqual(chamadas, [])
})
