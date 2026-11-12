// Teste de banco: cartão estornado (Mercado Pago) não é pendência, não é candidato a vínculo e o
// servidor recusa vinculá-lo. Roda as funções de verdade contra o Postgres descartável; só a sessão,
// o cookie e o cache do Next são simulados (fronteira de fora).
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
let contarPendenciasCartao: typeof import('@/lib/queries/conciliacao-pendentes')['contarPendenciasCartao']
let usuario: Sessao

const authMock = mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
const cacheMock = mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })
const headersMock = mock.module('next/headers', { namedExports: { cookies: async () => ({ get: () => undefined }) } })

before(async () => {
  ;({ db } = await import('@/lib/db'))
  actions = await import('@/app/(dashboard)/conciliacao/actions')
  ;({ contarPendenciasCartao } = await import('@/lib/queries/conciliacao-pendentes'))
})
after(async () => {
  authMock.restore(); cacheMock.restore(); headersMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

async function semear() {
  const suf = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'CARTST', nome: suf, cnpj: suf })
  const usuarioId = await semearUsuario(db, base, { papel: 'aux_adm' })
  const [modelo] = await linhas(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'CARTST ' + suf}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [moto] = await linhas(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${modelo.id}, ${base.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
  const [pedido] = await linhas(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${base.lojaId}, ${usuarioId}) returning id`)
  const [venda] = await linhas(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, pagamentos, data_venda)
    values (${pedido.id}, ${moto.id}, ${base.lojaId}, ${usuarioId}, ${usuarioId}, 'Cliente sintético', '52998224725', 1000, 'cartao_credito',
      '[{"tipo":"cartao_credito","valor":1000,"parcelas":1}]'::jsonb, '2026-11-05 12:00:00-03'::timestamptz) returning id`)
  usuario = { id: usuarioId, papel: 'aux_adm', lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [], gruposAprovacao: [] }
  return { base, vendaId: venda.id as string }
}

async function cartao(grupoId: string, valor: number, status: string, vendaId: string | null) {
  const [c] = await linhas(sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, nsu, valor_bruto, status, venda_id, conciliado)
    values (${grupoId}, 'mercadopago', '2026-11-05', ${randomUUID()}, ${valor}, ${status}, ${vendaId}, false) returning id`)
  return c.id as string
}
const linhaDe = async (id: string) =>
  (await linhas(sql`select status, conciliado, venda_id, peca_venda_id, os_id from conciliacoes_cartao where id = ${id}`))[0]

test('cartão estornado não conta como pendência no dashboard; o aprovado sem vínculo conta', async () => {
  const { base, vendaId } = await semear()
  await cartao(base.grupoId, 1000, 'aprovado', null)
  await cartao(base.grupoId, 1000, 'estornado', vendaId)
  await cartao(base.grupoId, 500, 'estornado', null)
  assert.equal(await contarPendenciasCartao(base.grupoId), 1)
})

test('cartão estornado não é oferecido na busca livre nem na busca por valor', async () => {
  const { base, vendaId } = await semear()
  const aprovado = await cartao(base.grupoId, 4321.09, 'aprovado', null)
  const estornadoLigado = await cartao(base.grupoId, 4321.09, 'estornado', vendaId)
  const estornadoSolto = await cartao(base.grupoId, 4321.09, 'estornado', null)

  const livres = (await actions.buscarConciliacoesLivres('4321,09')).map(l => l.id)
  assert.ok(livres.includes(aprovado))
  assert.ok(!livres.includes(estornadoLigado))
  assert.ok(!livres.includes(estornadoSolto))

  const porValor = (await actions.buscarConciliacoesPorValor(4321.09)).map(l => l.id)
  assert.ok(porValor.includes(aprovado))
  assert.ok(!porValor.includes(estornadoSolto))
})

test('vincular cartão estornado é recusado com a frase de "não encontrada" e a linha não muda', async () => {
  const { base, vendaId } = await semear()
  const estornado = await cartao(base.grupoId, 1000, 'estornado', vendaId)
  const antes = await linhaDe(estornado)

  await assert.rejects(actions.vincularVendaAction(estornado, vendaId, 'moto'), { message: 'Conciliação não encontrada' })
  assert.deepEqual(await linhaDe(estornado), antes)
  assert.equal(antes.conciliado, false)

  // Mesma frase de um id que não existe: a recusa não revela que a linha existe.
  await assert.rejects(actions.vincularVendaAction(randomUUID(), vendaId, 'moto'), { message: 'Conciliação não encontrada' })

  // O aprovado continua vinculando.
  const aprovado = await cartao(base.grupoId, 1000, 'aprovado', null)
  await actions.vincularVendaAction(aprovado, vendaId, 'moto')
  const depois = await linhaDe(aprovado)
  assert.equal(depois.conciliado, true)
  assert.equal(depois.venda_id, vendaId)
})
