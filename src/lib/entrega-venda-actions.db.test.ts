// Teste de banco da Entrega da venda (#725): o Novo pedido grava a Entrega, a efetivação a leva
// para a venda e a Conta B não lê nem altera a da Conta A. Roda contra o Postgres descartável do CI
// (job `banco`); local: `npm run test:db:local`.
// As actions gravam fora de transação de teste: cada cenário cria a própria Conta e só confere o que criou.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url

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
let vendaDoUsuarioParaNf: typeof import('@/lib/venda-do-usuario')['vendaDoUsuarioParaNf']
let vendas: typeof import('@/lib/db/schema')['vendas']
let eq: typeof import('drizzle-orm')['eq']

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ criarPedidoVendaAction, efetivarVendaAction } = await import('@/app/(dashboard)/vendas/actions'))
  ;({ vendaDoUsuarioParaNf } = await import('@/lib/venda-do-usuario'))
  ;({ vendas } = await import('@/lib/db/schema'))
  ;({ eq } = await import('drizzle-orm'))
})
after(async () => {
  authMock.restore()
  cacheMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const idDe = async (q: ReturnType<typeof sql>) => (await execRows(q))[0].id as string

const RETIRA = { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' } as const

async function semearConta() {
  const sufixo = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'EV725', nome: sufixo, cnpj: sufixo })
  const auxId = await semearUsuario(db, base, { papel: 'aux_adm', rotulo: 'aux', comConta: true })
  const vendedorId = await semearUsuario(db, base, { papel: 'vendedor', rotulo: 'vend', comConta: true })
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'EV725 ' + sufixo}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${modeloId}, ${base.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  const origemId = await idDe(sql`insert into origens_venda (grupo_id, nome) values (${base.grupoId}, 'Passou na porta') returning id`)
  const comum = { lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [] }
  return { motoId, origemId, aux: { id: auxId, papel: 'aux_adm', ...comum }, vendedor: { id: vendedorId, papel: 'vendedor', ...comum } }
}

const pedidosDaMoto = (motoId: string) => execRows(sql`select id, status, entrega from pedidos_venda where moto_id = ${motoId}`)
const vendasDaMoto = (motoId: string) => execRows(sql`select entrega from vendas where moto_id = ${motoId}`)

async function criarPedido(c: Awaited<ReturnType<typeof semearConta>>) {
  usuario = c.vendedor
  assert.deepEqual(await criarPedidoVendaAction(c.motoId, '', RETIRA), { ok: true, dados: undefined })
  return (await pedidosDaMoto(c.motoId))[0].id as string
}

const efetivar = (pedidoId: string, origemId: string) =>
  efetivarVendaAction(pedidoId, 'Cliente sintético', '529.982.247-25', '1000', 'pix', undefined, origemId)

test('o Novo pedido grava a Entrega e a efetivação a leva para a venda sem o navegador mandar de novo', async () => {
  const a = await semearConta()
  const pedidoId = await criarPedido(a)
  assert.deepEqual(await pedidosDaMoto(a.motoId), [{ id: pedidoId, status: 'pendente', entrega: RETIRA }])

  usuario = a.aux
  assert.deepEqual(await efetivar(pedidoId, a.origemId), { ok: true, dados: undefined })
  assert.deepEqual(await vendasDaMoto(a.motoId), [{ entrega: RETIRA }])
})

test('pedido de antes da Entrega (coluna vazia) vira venda com a Entrega vazia', async () => {
  const a = await semearConta()
  const pedidoId = await idDe(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${a.motoId}, ${a.aux.lojaId}, ${a.vendedor.id}) returning id`)
  usuario = a.aux
  assert.deepEqual(await efetivar(pedidoId, a.origemId), { ok: true, dados: undefined })
  assert.deepEqual(await vendasDaMoto(a.motoId), [{ entrega: null }])
})

test('modalidade fora da lista é recusada e nada é gravado: a moto continua disponível', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(
    await criarPedidoVendaAction(a.motoId, '', { modo: 'retira', modalidade: 'SemTransporte' }),
    { ok: false, erro: 'Modalidade do frete inválida.' },
  )
  assert.deepEqual(await pedidosDaMoto(a.motoId), [])
  assert.deepEqual(await execRows(sql`select disponibilidade from motos where id = ${a.motoId}`), [{ disponibilidade: 'disponivel' }])
})

test('Conta B não cria pedido com Entrega na moto da Conta A: mesma frase de moto inexistente', async () => {
  const a = await semearConta()
  const b = await semearConta()
  usuario = b.vendedor
  const daOutraConta = await criarPedidoVendaAction(a.motoId, '', RETIRA)
  assert.deepEqual(daOutraConta, await criarPedidoVendaAction(randomUUID(), '', RETIRA))
  assert.deepEqual(daOutraConta, { ok: false, erro: 'Moto não encontrada' })
  assert.deepEqual(await pedidosDaMoto(a.motoId), [])
})

test('Conta B não efetiva o pedido da Conta A: mesma frase de pedido inexistente, Entrega intacta e nenhuma venda', async () => {
  const a = await semearConta()
  const b = await semearConta()
  const pedidoId = await criarPedido(a)
  usuario = b.aux
  const daOutraConta = await efetivar(pedidoId, b.origemId)
  assert.deepEqual(daOutraConta, await efetivar(randomUUID(), b.origemId))
  assert.deepEqual(daOutraConta, { ok: false, erro: 'Pedido não encontrado' })
  assert.deepEqual(await pedidosDaMoto(a.motoId), [{ id: pedidoId, status: 'pendente', entrega: RETIRA }])
  assert.deepEqual(await vendasDaMoto(a.motoId), [])
})

test('a NF da Conta A lê a Entrega da venda; a Conta B não acha a venda, igual a uma moto sem venda (cenário 17)', async () => {
  const a = await semearConta()
  const b = await semearConta()
  const pedidoId = await criarPedido(a)
  usuario = a.aux
  assert.deepEqual(await efetivar(pedidoId, a.origemId), { ok: true, dados: undefined })

  assert.deepEqual((await vendaDoUsuarioParaNf(a.aux, eq(vendas.motoId, a.motoId)))?.entrega, RETIRA)
  assert.equal(await vendaDoUsuarioParaNf(b.aux, eq(vendas.motoId, a.motoId)), null)
  assert.equal(await vendaDoUsuarioParaNf(b.aux, eq(vendas.motoId, randomUUID())), null)
})

// "Entregar" (#726): endereço e quem recebe saem do Novo pedido e chegam à venda sem redigitar.
const ENTREGAR = {
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente',
  endereco: { cep: '65000000', logradouro: 'Rua de exemplo', numero: '100', complemento: '', bairro: 'Centro', cidade: '2111300', nomeCidade: 'São Luís', uf: 'MA' },
  recebe: { nome: 'Pessoa que recebe', cpfCnpj: '52998224725' },
} as const

test('o Novo pedido grava "Entregar" com endereço e quem recebe, e a efetivação leva para a venda', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', ENTREGAR), { ok: true, dados: undefined })
  const [pedido] = await pedidosDaMoto(a.motoId)
  assert.deepEqual(pedido.entrega, ENTREGAR)
  usuario = a.aux
  assert.deepEqual(await efetivar(pedido.id as string, a.origemId), { ok: true, dados: undefined })
  assert.deepEqual(await vendasDaMoto(a.motoId), [{ entrega: ENTREGAR }])
})

test('"Outra pessoa recebe" com CPF inválido é recusado como o do comprador e nada é gravado', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(
    await criarPedidoVendaAction(a.motoId, '', { ...ENTREGAR, recebe: { nome: 'Pessoa que recebe', cpfCnpj: '529.982.247-24' } }),
    { ok: false, erro: 'CPF inválido. Confira os números.' },
  )
  assert.deepEqual(await pedidosDaMoto(a.motoId), [])
})

test('Conta B não cria pedido "Entregar" na moto da Conta A nem lê o endereço da venda da A', async () => {
  const a = await semearConta()
  const b = await semearConta()
  usuario = b.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', ENTREGAR), { ok: false, erro: 'Moto não encontrada' })
  assert.deepEqual(await pedidosDaMoto(a.motoId), [])

  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', ENTREGAR), { ok: true, dados: undefined })
  const [pedido] = await pedidosDaMoto(a.motoId)
  usuario = b.aux
  assert.deepEqual(await efetivar(pedido.id as string, b.origemId), { ok: false, erro: 'Pedido não encontrado' })
  usuario = a.aux
  assert.deepEqual(await efetivar(pedido.id as string, a.origemId), { ok: true, dados: undefined })
  assert.equal(await vendaDoUsuarioParaNf(b.aux, eq(vendas.motoId, a.motoId)), null)
})
