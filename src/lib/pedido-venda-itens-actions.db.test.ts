// Teste de banco: Postgres descartável. Itens do pedido (#774) pelas actions de Vendas: o
// "Vender" (direto e com aprovação) grava a moto como item com o valor da venda, e efetivar
// pela Conta B o pedido da Conta A recusa como id inexistente, sem mexer no item.
// Fronteira de fora mockada por mockarFronteiraDasVendas (src/test/fronteira-vendas.ts).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import { mockarFronteiraDasVendas } from '@/test/fronteira-vendas'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'PVI774'
let usuarioDaSessao: Record<string, unknown> = {}

const restaurarMocks = mockarFronteiraDasVendas(() => usuarioDaSessao)

type Db = typeof import('@/lib/db')
type Vendas = typeof import('@/app/(dashboard)/vendas/actions')
let db: Db['db']
let execRows: Db['execRows']
let vendas: Vendas
let criarPedidoTx: typeof import('@/lib/pedido-venda')['criarPedidoTx']

type Conta = { contaId: string; grupoId: string; lojaId: string; modeloId: string; origemId: string; socio: Record<string, unknown>; aux: Record<string, unknown> }
const contas: Conta[] = []


async function semearConta(nome: string, cnpj: string): Promise<Conta> {
  const base = await semearContaBase(db, { prefixo: P, nome, cnpj })
  const socioId = await semearUsuario(db, base, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  const auxId = await semearUsuario(db, base, { papel: 'aux_adm', rotulo: 'aux' })
  const [modelo] = await execRows(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${P + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [origem] = await execRows(sql`insert into origens_venda (grupo_id, nome) values (${base.grupoId}, ${'Loja ' + P}) returning id`)
  const conta = {
    contaId: base.contaId, grupoId: base.grupoId, lojaId: base.lojaId, modeloId: modelo.id, origemId: origem.id,
    socio: { id: socioId, papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId, grupoLiberado: null },
    aux: { id: auxId, papel: 'aux_adm', lojaId: base.lojaId, gruposAcesso: null, contaId: base.contaId, grupoLiberado: null },
  }
  contas.push(conta)
  return conta
}

let A: Conta
let B: Conta

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  vendas = await import('@/app/(dashboard)/vendas/actions')
  ;({ criarPedidoTx } = await import('@/lib/pedido-venda'))
  // As actions usam o db global: a semente é gravada e apagada no after.
  A = await semearConta('A', '00000000077401')
  B = await semearConta('B', '00000000077402')
})

after(async () => {
  const daSemente = sql`(select id from motos where chassi like ${P + '%'})`
  await db.execute(sql`delete from lancamentos_caixa where venda_id in (select id from vendas where moto_id in ${daSemente})`)
  // pedidos_venda leva os itens junto (on delete cascade).
  for (const t of ['vendas', 'reservas', 'pedidos_venda', 'aprovacoes_venda', 'historico_estoque']) {
    await db.execute(sql`delete from ${sql.raw(t)} where moto_id in ${daSemente}`)
  }
  await db.execute(sql`delete from motos where chassi like ${P + '%'}`)
  await db.execute(sql`delete from log_acoes where usuario_id in (select id from usuarios where email like ${'%-' + P.toLowerCase() + '-%'})`)
  for (const c of contas) {
    await db.execute(sql`delete from clientes where conta_id = ${c.contaId}`)
    await db.execute(sql`delete from origens_venda where grupo_id = ${c.grupoId}`)
  }
  await db.execute(sql`delete from modelos where modelo like ${P + '%'}`)
  await db.execute(sql`delete from usuarios where email like ${'%-' + P.toLowerCase() + '-%'}`)
  for (const c of contas) {
    await db.execute(sql`delete from lojas where grupo_id = ${c.grupoId}`)
    await db.execute(sql`delete from grupos where id = ${c.grupoId}`)
    await db.execute(sql`delete from contas where id = ${c.contaId}`)
  }
  restaurarMocks()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

async function novaMoto(c: Conta, rotulo: string) {
  const [m] = await execRows(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${P + rotulo}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  return m.id as string
}

const venda = (c: Conta, motoId: string, tipo: string) => ({
  motoId, clienteNome: 'Cliente ' + P, clienteCpf: '52998224725', clienteCelular: '35999990774', clienteEmail: 'c@example.com',
  clienteCep: '', clienteLogradouro: '', clienteNumero: '', clienteComplemento: '', clienteBairro: '', clienteCidade: '', clienteEstado: '',
  valorTotal: '12000', pagamentos: [{ tipo, valor: 12000 }], origemId: c.origemId,
})

/** Itens do pedido da moto, pela moto (o pedido do "Vender" nasce dentro da action). */
const itensDaMoto = (motoId: string) => execRows(sql`
  select i.tipo, i.moto_id as "motoId", i.quantidade, i.valor_unitario as "valorUnitario"
  from pedidos_venda_itens i join pedidos_venda p on p.id = i.pedido_venda_id where p.moto_id = ${motoId}`)

test('V1: o "Vender" grava a moto como item do pedido, com o valor da venda', async () => {
  usuarioDaSessao = A.socio
  const moto = await novaMoto(A, 'V1')
  assert.equal((await vendas.registrarVendaCompletaAction(venda(A, moto, 'pix'))).ok, true)
  assert.deepEqual(await itensDaMoto(moto), [{ tipo: 'moto', motoId: moto, quantidade: '1.00', valorUnitario: '12000.00' }])
})

test('V2: "Vender" com aprovação: o item nasce quando a venda é aprovada, com o valor', async () => {
  usuarioDaSessao = A.socio
  const moto = await novaMoto(A, 'V2')
  assert.deepEqual(await vendas.solicitarAprovacaoVendaAction(venda(A, moto, 'transferencia'), '', 'pagamento_sensivel'), { ok: true, dados: undefined })
  assert.deepEqual(await itensDaMoto(moto), [])
  const [{ id }] = await execRows(sql`select id from aprovacoes_venda where moto_id = ${moto} and status = 'pendente'`)
  // Quem aprova transferência bancária tem a permissão ligada no cadastro, para o grupo da loja.
  usuarioDaSessao = { ...A.socio, aprovaPagamentoSensivel: true, gruposAprovacao: [A.grupoId] }
  assert.deepEqual(await vendas.aprovarVendaAction(id), { ok: true, dados: undefined })
  assert.deepEqual(await itensDaMoto(moto), [{ tipo: 'moto', motoId: moto, quantidade: '1.00', valorUnitario: '12000.00' }])
})

test('V3: Conta B efetiva o pedido da Conta A: mesma frase de id inexistente, e o item da Conta A não muda', async () => {
  const moto = await novaMoto(A, 'V3')
  const { pedidoId } = await db.transaction(tx => criarPedidoTx(tx, {
    motoId: moto, vendedorId: A.aux.id as string, observacao: null, entrega: { modo: 'retira', modalidade: '' },
  }))
  const antes = await itensDaMoto(moto)
  assert.deepEqual(antes, [{ tipo: 'moto', motoId: moto, quantidade: '1.00', valorUnitario: null }])
  for (const usuario of [B.aux, B.socio]) {
    usuarioDaSessao = usuario
    const efetivar = (id: string) => vendas.efetivarVendaAction(id, 'Cliente ' + P, '52998224725', '9000', 'pix', undefined, B.origemId)
    assert.deepEqual(await efetivar(pedidoId), await efetivar(crypto.randomUUID()))
    assert.deepEqual(await efetivar(pedidoId), { ok: false, erro: 'Pedido não encontrado' })
  }
  assert.deepEqual(await itensDaMoto(moto), antes)
})

test('V4: Editar venda que muda o valor muda também o valor do item da moto', async () => {
  usuarioDaSessao = A.socio
  const moto = await novaMoto(A, 'V4')
  assert.equal((await vendas.registrarVendaCompletaAction(venda(A, moto, 'pix'))).ok, true)
  const [{ id }] = await execRows(sql`select id from vendas where moto_id = ${moto}`)
  const r = await vendas.editarVendaAction(id, {
    valor: '11500', dataVenda: '2026-11-07', pagamentos: [{ tipo: 'pix', valor: 11500 }],
    clienteNome: 'Cliente ' + P, clienteCpf: '52998224725',
  })
  assert.deepEqual(r, { ok: true, dados: undefined })
  assert.deepEqual(await itensDaMoto(moto), [{ tipo: 'moto', motoId: moto, quantidade: '1.00', valorUnitario: '11500.00' }])
})
