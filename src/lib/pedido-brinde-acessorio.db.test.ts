// Teste de banco do brinde e do acessório no pedido (#778): peças do catálogo da Conta, baixa de estoque na
// efetivação (saldo pode ficar negativo), venda de peça ligada ao pedido sem caixa próprio e a base de peças
// da folha. As actions gravam fora de transação de teste: cada cenário cria a própria Conta e só confere o que criou.
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
let actions: Actions

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  actions = await import('@/app/(dashboard)/vendas/actions')
})
after(async () => {
  authMock.restore()
  cacheMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const idDe = async (q: ReturnType<typeof sql>) => (await execRows(q))[0].id as string
const RETIRA = { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' } as const
const CPF = '529.982.247-25'

async function semearConta() {
  const sufixo = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'BA778', nome: sufixo, cnpj: sufixo })
  const auxId = await semearUsuario(db, base, { papel: 'aux_adm', rotulo: 'aux', comConta: true })
  const vendedorId = await semearUsuario(db, base, { papel: 'vendedor', rotulo: 'vend', comConta: true })
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'BA778 ' + sufixo}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${modeloId}, ${base.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  const origemId = await idDe(sql`insert into origens_venda (grupo_id, nome) values (${base.grupoId}, 'Passou na porta') returning id`)
  // Capacete com 1 no estoque da loja; antena sem linha de saldo (zero).
  const capacete = await idDe(sql`insert into pecas_catalogo (conta_id, nome, valor) values (${base.contaId}, 'Capacete BA778', '250.00') returning id`)
  const antena = await idDe(sql`insert into pecas_catalogo (conta_id, nome, valor) values (${base.contaId}, 'Antena BA778', '40.00') returning id`)
  await execRows(sql`insert into pecas_estoque_loja (peca_id, loja_id, quantidade) values (${capacete}, ${base.lojaId}, 1)`)
  const comum = { lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [] }
  return {
    ...base, motoId, origemId, capacete, antena,
    aux: { id: auxId, papel: 'aux_adm', ...comum },
    vendedor: { id: vendedorId, papel: 'vendedor', ...comum },
  }
}
type Conta = Awaited<ReturnType<typeof semearConta>>
type PecaDoPedido = { tipo: 'brinde' | 'acessorio'; pecaId: string; quantidade: number; valorUnitario?: number }

async function criarPedido(c: Conta, pecas: PecaDoPedido[], quem = c.vendedor) {
  usuario = quem
  const r = await actions.criarPedidoVendaAction(c.motoId, '', RETIRA, pecas)
  const [p] = await execRows(sql`select id from pedidos_venda where moto_id = ${c.motoId} and status = 'pendente'`)
  return { r, pedidoId: p?.id as string | undefined }
}
const itensPeca = (pedidoId: string) => execRows(sql`select tipo, peca_id, quantidade, valor_unitario from pedidos_venda_itens
  where pedido_venda_id = ${pedidoId} and tipo <> 'moto' order by tipo`)
const saldo = async (c: Conta, pecaId: string) =>
  Number((await execRows(sql`select coalesce(sum(quantidade), 0) as q from pecas_estoque_loja where peca_id = ${pecaId} and loja_id = ${c.lojaId}`))[0].q)
const efetivar = (c: Conta, pedidoId: string, valorMoto: number, pagamentos: { tipo: string; valor: number }[]) => {
  usuario = c.aux
  return actions.efetivarVendaAction(pedidoId, 'Cliente sintético', CPF, String(valorMoto), pagamentos, undefined, c.origemId)
}
const BRINDE_E_ACESSORIO = (c: Conta): PecaDoPedido[] => [
  { tipo: 'brinde', pecaId: c.antena, quantidade: 1 },
  { tipo: 'acessorio', pecaId: c.capacete, quantidade: 2, valorUnitario: 200 },
]

test('B1: vendedor cria pedido com brinde e acessório: brinde R$ 0, acessório pelo catálogo (o ajuste é só de gestor); estoque intacto', async () => {
  const a = await semearConta()
  const { r, pedidoId } = await criarPedido(a, BRINDE_E_ACESSORIO(a))
  assert.deepEqual(r, { ok: true, dados: undefined })
  assert.deepEqual(await itensPeca(pedidoId!), [
    { tipo: 'acessorio', peca_id: a.capacete, quantidade: '2.00', valor_unitario: '250.00' },
    { tipo: 'brinde', peca_id: a.antena, quantidade: '1.00', valor_unitario: '0.00' },
  ])
  assert.deepEqual([await saldo(a, a.capacete), await saldo(a, a.antena)], [1, 0])
})

test('B1b: aux_adm (gestor) ajusta o preço do acessório; o brinde segue R$ 0 mesmo com valor mandado', async () => {
  const a = await semearConta()
  const { pedidoId } = await criarPedido(a, [{ tipo: 'brinde', pecaId: a.antena, quantidade: 1, valorUnitario: 40 }, { tipo: 'acessorio', pecaId: a.capacete, quantidade: 2, valorUnitario: 200 }], a.aux)
  assert.deepEqual((await itensPeca(pedidoId!)).map(i => [i.tipo, i.valor_unitario]), [['acessorio', '200.00'], ['brinde', '0.00']])
})

test('B2: peça de outra Conta e id inexistente: "Peça não encontrada", nada gravado', async () => {
  const a = await semearConta()
  const b = await semearConta()
  for (const pecaId of [b.capacete, randomUUID()]) {
    const { r, pedidoId } = await criarPedido(a, [{ tipo: 'acessorio', pecaId, quantidade: 1 }])
    assert.deepEqual(r, { ok: false, erro: 'Peça não encontrada' })
    assert.equal(pedidoId, undefined)
  }
  assert.equal(await saldo(b, b.capacete), 1)
})

test('B3: quantidade inválida é recusada com a frase da venda de peça', async () => {
  const a = await semearConta()
  const { r, pedidoId } = await criarPedido(a, [{ tipo: 'acessorio', pecaId: a.capacete, quantidade: 1.5 }])
  assert.equal(r.ok, false)
  assert.equal(pedidoId, undefined)
})

test('B4/B5/B6: efetivar fecha com moto + acessórios, baixa o estoque (zero vira negativo) e cria a venda de peça do pedido sem caixa próprio', async () => {
  const a = await semearConta()
  const { pedidoId } = await criarPedido(a, BRINDE_E_ACESSORIO(a), a.aux)
  // Só a moto: falta o acessório (2 × 200).
  assert.deepEqual(await efetivar(a, pedidoId!, 10000, [{ tipo: 'dinheiro', valor: 10000 }]),
    { ok: false, erro: 'Somatório das formas de pagamento difere do valor da venda' })
  assert.deepEqual(await efetivar(a, pedidoId!, 10000, [{ tipo: 'dinheiro', valor: 10400 }]), { ok: true, dados: undefined })

  assert.deepEqual([await saldo(a, a.capacete), await saldo(a, a.antena)], [-1, -1])
  const [venda] = await execRows(sql`select id, valor, pagamentos from vendas where pedido_venda_id = ${pedidoId}`)
  assert.deepEqual([venda.valor, venda.pagamentos], ['10000.00', [{ tipo: 'dinheiro', valor: 10400 }]])
  const pecas = await execRows(sql`select id, vendedor_id, loja_id, valor_total, caixa_automatico from vendas_pecas where pedido_venda_id = ${pedidoId}`)
  assert.equal(pecas.length, 1)
  assert.deepEqual({ ...pecas[0], id: undefined }, { id: undefined, vendedor_id: a.aux.id, loja_id: a.lojaId, valor_total: '400.00', caixa_automatico: false })
  const itens = await execRows(sql`select peca_id, descricao, quantidade, valor_unitario from vendas_pecas_itens where venda_peca_id = ${pecas[0].id} order by descricao`)
  assert.deepEqual(itens, [
    { peca_id: a.antena, descricao: 'Antena BA778', quantidade: '1.00', valor_unitario: '0.00' },
    { peca_id: a.capacete, descricao: 'Capacete BA778', quantidade: '2.00', valor_unitario: '200.00' },
  ])
  // O dinheiro entra uma vez, pela venda da moto.
  const caixa = await execRows(sql`select l.valor from lancamentos_caixa l where l.venda_id = ${venda.id} or l.venda_peca_id = ${pecas[0].id}`)
  assert.deepEqual(caixa, [{ valor: '10400.00' }])
})

test('B7: folha: o acessório entra na base de peças do vendedor do pedido e da loja; a moto segue sem o acessório', async () => {
  const a = await semearConta()
  const { pedidoId } = await criarPedido(a, BRINDE_E_ACESSORIO(a), a.aux)
  await efetivar(a, pedidoId!, 10000, [{ tipo: 'pix', valor: 10400 }])
  const { buscarDadosFolha } = await import('@/lib/queries/folha')
  const mes = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }).slice(0, 7)
  const dados = await buscarDadosFolha({ mes, lojaIds: [a.lojaId], grupoId: a.grupoId })
  assert.deepEqual(dados.pecasPorVendedor.map(v => [v.vendedorId, Number(v.total)]), [[a.aux.id, 400]])
  assert.deepEqual(dados.pecasPorLoja.map(l => [l.lojaId, Number(l.total)]), [[a.lojaId, 400]])
  assert.deepEqual(dados.vendasPorVendedor.map(v => [v.vendedorId, Number(v.total)]), [[a.aux.id, 10000]])
})

test('B7b: pedido só com brinde: venda de peça de R$ 0, base de peças não muda', async () => {
  const a = await semearConta()
  const { pedidoId } = await criarPedido(a, [{ tipo: 'brinde', pecaId: a.capacete, quantidade: 1 }], a.aux)
  assert.deepEqual(await efetivar(a, pedidoId!, 10000, [{ tipo: 'pix', valor: 10000 }]), { ok: true, dados: undefined })
  assert.deepEqual(await execRows(sql`select valor_total from vendas_pecas where pedido_venda_id = ${pedidoId}`), [{ valor_total: '0.00' }])
  assert.equal(await saldo(a, a.capacete), 0)
})

test('B8: gancho do cancelar: excluir a venda de peça do pedido devolve o estoque', async () => {
  const a = await semearConta()
  const { pedidoId } = await criarPedido(a, BRINDE_E_ACESSORIO(a), a.aux)
  await efetivar(a, pedidoId!, 10000, [{ tipo: 'pix', valor: 10400 }])
  const [{ id }] = await execRows(sql`select id from vendas_pecas where pedido_venda_id = ${pedidoId}`)
  const { excluirVendaPecaTx } = await import('@/lib/excluir-venda-peca')
  await db.transaction(tx => excluirVendaPecaTx(tx, { ...a.aux, papel: 'admin_geral' } as never, id as string))
  assert.deepEqual([await saldo(a, a.capacete), await saldo(a, a.antena)], [1, 0])
})

test('B9: pedido sem brinde nem acessório fica como antes: nenhuma venda de peça', async () => {
  const a = await semearConta()
  const { pedidoId } = await criarPedido(a, [], a.aux)
  assert.deepEqual(await efetivar(a, pedidoId!, 10000, [{ tipo: 'pix', valor: 10000 }]), { ok: true, dados: undefined })
  assert.deepEqual(await execRows(sql`select id from vendas_pecas where pedido_venda_id = ${pedidoId}`), [])
})

test('B10: com aprovação (#776), o estoque só baixa na aprovação, e o acessório não cobre o mínimo da moto', async () => {
  const a = await semearConta()
  const modelo = (await execRows(sql`select mo.modelo from motos m join modelos mo on mo.id = m.modelo_id where m.id = ${a.motoId}`))[0].modelo as string
  await execRows(sql`insert into precificacao (grupo_id, nome, valor_minimo) values (${a.grupoId}, ${modelo}, '10000')`)
  await execRows(sql`insert into configuracao_taxas (grupo_id) values (${a.grupoId})`)
  const { pedidoId } = await criarPedido(a, BRINDE_E_ACESSORIO(a), a.aux)
  usuario = a.aux
  // Moto 9.900 + acessórios 400 = 10.300: o total passa do mínimo, a moto não.
  const r = await actions.efetivarVendaAction(pedidoId!, 'Cliente sintético', CPF, '9900', [{ tipo: 'pix', valor: 10300 }], undefined, a.origemId, undefined, 'Cliente fiel')
  assert.deepEqual(r, { ok: true, dados: { aprovacao: 'valor_minimo' } })
  assert.deepEqual([await saldo(a, a.capacete), await saldo(a, a.antena)], [1, 0])
  const [ap] = await execRows(sql`select id, valor, liquido_snapshot from aprovacoes_venda where moto_id = ${a.motoId}`)
  assert.deepEqual([ap.valor, ap.liquido_snapshot], ['9900.00', '9900.00'])
  usuario = { ...a.aux, papel: 'admin_geral' }
  assert.deepEqual(await actions.aprovarVendaAction(ap.id as string), { ok: true, dados: undefined })
  assert.deepEqual([await saldo(a, a.capacete), await saldo(a, a.antena)], [-1, -1])
  assert.deepEqual(await execRows(sql`select valor_total from vendas_pecas where pedido_venda_id = ${pedidoId}`), [{ valor_total: '400.00' }])
})
