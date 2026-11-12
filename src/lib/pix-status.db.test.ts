// Teste de banco: Pix estornado ligado à venda deixa de cobrir pagamento. Roda as funções de verdade
// contra o Postgres descartável; só a sessão e o cache do Next são simulados (fronteira de fora).
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url

type Sessao = { id: string; papel: string; lojaId: string | null; contaId: string | null; gruposAcesso: string[]; gruposAprovacao: string[] }
let db: typeof import('@/lib/db')['db']
let actions: typeof import('@/app/(dashboard)/conciliacao/actions')
let usuario: Sessao

const authMock = mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
const cacheMock = mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })
const headersMock = mock.module('next/headers', { namedExports: { cookies: async () => ({ get: () => undefined }) } })

before(async () => {
  ;({ db } = await import('@/lib/db'))
  actions = await import('@/app/(dashboard)/conciliacao/actions')
})
after(async () => {
  authMock.restore(); cacheMock.restore(); headersMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

async function semear() {
  const suf = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'PIXST', nome: suf, cnpj: suf })
  const usuarioId = await semearUsuario(db, base, { papel: 'aux_adm' })
  const [modelo] = await linhas(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'PIXST ' + suf}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [moto] = await linhas(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${modelo.id}, ${base.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
  const [pedido] = await linhas(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${base.lojaId}, ${usuarioId}) returning id`)
  const [venda] = await linhas(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, pagamentos, data_venda)
    values (${pedido.id}, ${moto.id}, ${base.lojaId}, ${usuarioId}, ${usuarioId}, 'Cliente sintético', '52998224725', 1000, 'pix',
      '[{"tipo":"pix","valor":1000}]'::jsonb, '2026-11-05 12:00:00-03'::timestamptz) returning id`)
  usuario = { id: usuarioId, papel: 'aux_adm', lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [], gruposAprovacao: [] }
  return { base, vendaId: venda.id as string }
}

async function pix(grupoId: string, valor: number, status: string, vendaId: string | null) {
  const [p] = await linhas(sql`insert into pix_recebimentos_mcp (grupo_id, conta_id, banco, transacao_id, data, valor, status, venda_id)
    values (${grupoId}, 'c', 'mercadopago', ${randomUUID()}, '2026-11-05 12:00:00-03'::timestamptz, ${valor}, ${status}, ${vendaId}) returning id`)
  return p.id as string
}

test('Pix estornado vinculado não aparece em buscarPixDoAlvo e o aprovado sim', async () => {
  const { base, vendaId } = await semear()
  const aprovado = await pix(base.grupoId, 600, 'aprovado', vendaId)
  await pix(base.grupoId, 400, 'estornado', vendaId)
  const r = await actions.buscarPixDoAlvo({ tipo: 'moto', id: vendaId })
  assert.deepEqual(r.map(l => l.id), [aprovado])
})

test('Pix estornado não é oferecido por buscarPixLivres; o aprovado sem vínculo é', async () => {
  const { base } = await semear()
  const aprovado = await pix(base.grupoId, 777.77, 'aprovado', null)
  const estornado = await pix(base.grupoId, 777.77, 'estornado', null)
  usuario = { ...usuario, papel: 'admin_socio' }
  const r = await actions.buscarPixLivres(777.77)
  const ids = r.map(l => l.id)
  assert.ok(ids.includes(aprovado))
  assert.ok(!ids.includes(estornado))
})

test('pixConciliadoValor da lista de vendas soma só o Pix que cobre', async () => {
  const { base, vendaId } = await semear()
  await pix(base.grupoId, 600, 'aprovado', vendaId)
  await pix(base.grupoId, 400, 'estornado', vendaId)
  const { listarVendas } = await import('@/lib/queries/vendas')
  const lista = await listarVendas({ lojaId: [base.lojaId] })
  const venda = lista.find(v => v.id === vendaId)
  assert.equal(Number(venda?.pixConciliadoValor), 600)
})
