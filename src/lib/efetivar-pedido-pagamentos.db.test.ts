// Teste de banco do pagamento do pedido na efetivação (#775): várias formas, caixa por pagamento em
// dinheiro, soma que não fecha recusada como no Vender e Conta B sem acesso ao pedido da Conta A.
// As actions gravam fora de transação de teste: cada cenário cria a própria Conta e só confere o que criou.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url
process.env.CERT_MASTER_KEY = 'a'.repeat(64)

type Usuario = { id: string; papel: string; lojaId: string; contaId: string; gruposAcesso: string[] }
let usuario: Usuario

const authMock = mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
const cacheMock = mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })

type Db = typeof import('@/lib/db')
type Actions = typeof import('@/app/(dashboard)/vendas/actions')
let db: Db['db']
let execRows: Db['execRows']
let criarPedidoVendaAction: Actions['criarPedidoVendaAction']
let efetivarVendaAction: Actions['efetivarVendaAction']

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ criarPedidoVendaAction, efetivarVendaAction } = await import('@/app/(dashboard)/vendas/actions'))
})
after(async () => {
  authMock.restore()
  cacheMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const idDe = async (q: ReturnType<typeof sql>) => (await execRows(q))[0].id as string
const RETIRA = { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' } as const
const CPF = '529.982.247-25'

async function semearConta(operadora: string) {
  const sufixo = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'PG775', nome: sufixo, cnpj: sufixo })
  const auxId = await semearUsuario(db, base, { papel: 'aux_adm', rotulo: 'aux', comConta: true })
  const vendedorId = await semearUsuario(db, base, { papel: 'vendedor', rotulo: 'vend', comConta: true })
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'PG775 ' + sufixo}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${modeloId}, ${base.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  const origemId = await idDe(sql`insert into origens_venda (grupo_id, nome) values (${base.grupoId}, 'Passou na porta') returning id`)
  await execRows(sql`insert into maquininhas (grupo_id, nome, operadora) values (${base.grupoId}, 'Maq', ${operadora})`)
  const comum = { lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [] }
  const c = { motoId, origemId, lojaId: base.lojaId, aux: { id: auxId, papel: 'aux_adm', ...comum }, vendedor: { id: vendedorId, papel: 'vendedor', ...comum } }
  usuario = c.vendedor
  assert.deepEqual(await criarPedidoVendaAction(motoId, '', RETIRA), { ok: true, dados: undefined })
  const [pedido] = await execRows(sql`select id from pedidos_venda where moto_id = ${motoId}`)
  return { ...c, pedidoId: pedido.id as string }
}

type Pagamento = { tipo: string; valor: number; operadora?: string; parcelas?: number }
const efetivar = (c: { pedidoId: string; origemId: string }, valor: string, pagamentos: Pagamento[]) =>
  efetivarVendaAction(c.pedidoId, 'Cliente sintético', CPF, valor, pagamentos, undefined, c.origemId)

const vendaDaMoto = (motoId: string) =>
  execRows(sql`select id, valor, forma_pagamento, pagamentos from vendas where moto_id = ${motoId}`)
const caixaDaMoto = (motoId: string) => execRows(sql`select l.loja_id, l.tipo, l.categoria, l.valor, l.data::text as data
  from lancamentos_caixa l join vendas v on v.id = l.venda_id where v.moto_id = ${motoId} order by l.valor`)
const diaDeHojeEmBrasilia = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

test('C1: dinheiro + PIX gravam as duas formas na venda do pedido, só com os campos conhecidos', async () => {
  const a = await semearConta('stone')
  usuario = a.aux
  // Campo a mais vindo do navegador não entra no jsonb.
  const daTela = [{ tipo: 'dinheiro', valor: 5000, extra: 'x' }, { tipo: 'pix', valor: 10000 }] as Pagamento[]
  assert.deepEqual(await efetivar(a, '15000', daTela), { ok: true, dados: undefined })
  const [venda] = await vendaDaMoto(a.motoId)
  assert.deepEqual([venda.valor, venda.forma_pagamento, venda.pagamentos],
    ['15000.00', 'multiplos', [{ tipo: 'dinheiro', valor: 5000 }, { tipo: 'pix', valor: 10000 }]])
})

test('C2: soma que não fecha com o total é recusada com a frase do Vender e nada é gravado', async () => {
  const a = await semearConta('stone')
  usuario = a.aux
  assert.deepEqual(await efetivar(a, '15000', [{ tipo: 'dinheiro', valor: 5000 }, { tipo: 'pix', valor: 9000 }]),
    { ok: false, erro: 'Somatório das formas de pagamento difere do valor da venda' })
  assert.deepEqual(await vendaDaMoto(a.motoId), [])
  assert.deepEqual(await execRows(sql`select status from pedidos_venda where id = ${a.pedidoId}`), [{ status: 'pendente' }])
})

test('C3/C4: um lançamento de caixa por pagamento em dinheiro, na loja e no dia de Brasília; efetivar de novo não duplica', async () => {
  const a = await semearConta('stone')
  usuario = a.aux
  const pagamentos = [{ tipo: 'dinheiro', valor: 3000 }, { tipo: 'pix', valor: 10000 }, { tipo: 'dinheiro', valor: 2000 }]
  assert.deepEqual(await efetivar(a, '15000', pagamentos), { ok: true, dados: undefined })
  const esperado = [
    { loja_id: a.lojaId, tipo: 'entrada', categoria: 'Venda', valor: '2000.00', data: diaDeHojeEmBrasilia() },
    { loja_id: a.lojaId, tipo: 'entrada', categoria: 'Venda', valor: '3000.00', data: diaDeHojeEmBrasilia() },
  ]
  assert.deepEqual(await caixaDaMoto(a.motoId), esperado)

  assert.deepEqual(await efetivar(a, '15000', pagamentos), { ok: false, erro: 'Este pedido não está mais pendente. Recarregue a página.' })
  assert.deepEqual(await caixaDaMoto(a.motoId), esperado)
})

test('C5: pedido de 1 moto com 1 pagamento fica igual a hoje (forma única, sem caixa no PIX)', async () => {
  const a = await semearConta('stone')
  usuario = a.aux
  assert.deepEqual(await efetivar(a, '12000', [{ tipo: 'pix', valor: 12000 }]), { ok: true, dados: undefined })
  const [venda] = await vendaDaMoto(a.motoId)
  assert.deepEqual([venda.forma_pagamento, venda.pagamentos], ['pix', [{ tipo: 'pix', valor: 12000 }]])
  assert.deepEqual(await caixaDaMoto(a.motoId), [])
})

test('C9: forma sem tipo ou com valor zero é recusada', async () => {
  const a = await semearConta('stone')
  usuario = a.aux
  assert.deepEqual(await efetivar(a, '1000', [{ tipo: 'pix', valor: 1000 }, { tipo: 'dinheiro', valor: 0 }]),
    { ok: false, erro: 'Toda forma de pagamento precisa de tipo e valor' })
  assert.deepEqual(await efetivar(a, '1000', [{ tipo: '', valor: 1000 }]),
    { ok: false, erro: 'Toda forma de pagamento precisa de tipo e valor' })
  assert.deepEqual(await vendaDaMoto(a.motoId), [])
})

test('C8: transferência numa das formas, por aux_adm sem a permissão, segue recusada como hoje', async () => {
  const a = await semearConta('stone')
  usuario = a.aux
  const r = await efetivar(a, '1000', [{ tipo: 'dinheiro', valor: 500 }, { tipo: 'transferencia', valor: 500 }])
  assert.equal(r.ok, false)
  assert.match((r as { erro: string }).erro, /precisa de aprovação/)
  assert.deepEqual(await vendaDaMoto(a.motoId), [])
})

test('C7: Conta B não efetiva o pedido da Conta A (mesma frase de inexistente) e não usa maquininha da Conta A', async () => {
  const a = await semearConta('stone')
  const b = await semearConta('pagueveloz')
  usuario = b.aux
  assert.deepEqual(await efetivar({ pedidoId: a.pedidoId, origemId: b.origemId }, '1000', [{ tipo: 'dinheiro', valor: 1000 }]),
    { ok: false, erro: 'Pedido não encontrado' })
  assert.deepEqual(await vendaDaMoto(a.motoId), [])
  assert.deepEqual(await caixaDaMoto(a.motoId), [])

  const cartao = (operadora: string) => [{ tipo: 'cartao_credito', valor: 1000, parcelas: 1, operadora }]
  assert.deepEqual(await efetivar(b, '1000', cartao('stone')), { ok: false, erro: 'Maquininha não encontrada' })
  assert.deepEqual(await vendaDaMoto(b.motoId), [])
  assert.deepEqual(await efetivar(b, '1000', cartao('pagueveloz')), { ok: true, dados: undefined })
})
