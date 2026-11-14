// Teste de banco da Entrega da venda (#725): o Novo pedido grava a Entrega, a efetivação a leva
// para a venda e a Conta B não lê nem altera a da Conta A. Roda contra o Postgres descartável do CI
// (job `banco`); local: `npm run test:db:local`.
// As actions gravam fora de transação de teste: cada cenário cria a própria Conta e só confere o que criou.
import { after, afterEach, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearGrupo, semearUsuario } from '@/test/semear-conta'
import { CANCELE_A_NF_PARA_ALTERAR, ENTREGA_EM_OUTRO_ESTADO, TRAVA_DO_ALTERAR, FRETE_FIXO_NA_VENDA, operacaoDaVenda, PEDIDO_EM_APROVACAO_PARA_ALTERAR, SEM_FRETE_NA_VENDA, type EntregaVenda } from '@/lib/notagateway/entrega'

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
let editarVendaAction: Actions['editarVendaAction']
let registrarVendaCompletaAction: Actions['registrarVendaCompletaAction']
let solicitarAprovacaoVendaAction: Actions['solicitarAprovacaoVendaAction']
let aprovarVendaAction: Actions['aprovarVendaAction']
let alterarEntregaDoPedidoAction: Actions['alterarEntregaDoPedidoAction']
let alterarEntregaDaVendaAction: Actions['alterarEntregaDaVendaAction']
let vendaDoUsuarioParaNf: typeof import('@/lib/venda-do-usuario')['vendaDoUsuarioParaNf']
let vendas: typeof import('@/lib/db/schema')['vendas']
let eq: typeof import('drizzle-orm')['eq']

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ criarPedidoVendaAction, efetivarVendaAction, editarVendaAction, registrarVendaCompletaAction, solicitarAprovacaoVendaAction, aprovarVendaAction, alterarEntregaDoPedidoAction, alterarEntregaDaVendaAction } = await import('@/app/(dashboard)/vendas/actions'))
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
  const socioId = await semearUsuario(db, base, { papel: 'admin_socio', rotulo: 'socio', comConta: true })
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'EV725 ' + sufixo}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${modeloId}, ${base.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  const origemId = await idDe(sql`insert into origens_venda (grupo_id, nome) values (${base.grupoId}, 'Passou na porta') returning id`)
  const comum = { lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [] }
  return { motoId, origemId, aux: { id: auxId, papel: 'aux_adm', ...comum }, vendedor: { id: vendedorId, papel: 'vendedor', ...comum }, socio: { id: socioId, papel: 'admin_socio', ...comum } }
}

const pedidosDaMoto = (motoId: string) => execRows(sql`select id, status, entrega from pedidos_venda where moto_id = ${motoId}`)
const vendasDaMoto = (motoId: string) => execRows(sql`select entrega from vendas where moto_id = ${motoId}`)

async function criarPedido(c: Awaited<ReturnType<typeof semearConta>>) {
  usuario = c.vendedor
  assert.deepEqual(await criarPedidoVendaAction(c.motoId, '', RETIRA), { ok: true, dados: undefined })
  return (await pedidosDaMoto(c.motoId))[0].id as string
}

const efetivar = (pedidoId: string, origemId: string) =>
  efetivarVendaAction(pedidoId, 'Cliente sintético', '529.982.247-25', '1000', [{ tipo: 'pix', valor: 1000 }], undefined, origemId)

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

// Frete cobrado (#726, 4b): soma no valor da venda, nas formas de pagamento e no caixa; vem do pedido, não do navegador.
const COM_FRETE = { ...ENTREGAR, frete: 350 }
const vendaDaMoto = (motoId: string) => execRows(sql`select valor, pagamentos, entrega->'frete' as frete, id from vendas where moto_id = ${motoId}`)

test('pedido com frete: a efetivação grava moto + frete no valor e no pagamento', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', COM_FRETE), { ok: true, dados: undefined })
  const [pedido] = await pedidosDaMoto(a.motoId)
  assert.deepEqual(pedido.entrega, COM_FRETE)
  usuario = a.aux
  assert.deepEqual(await efetivarVendaAction(pedido.id as string, 'Cliente sintético', '529.982.247-25', '10000', [{ tipo: 'pix', valor: 10350 }], undefined, a.origemId), { ok: true, dados: undefined })
  const [venda] = await vendaDaMoto(a.motoId)
  assert.equal(Number(venda.valor), 10350)
  assert.deepEqual(venda.pagamentos, [{ tipo: 'pix', valor: 10350 }])
  assert.equal(venda.frete, 350)
})

test('pedido com frete pago em dinheiro: o caixa recebe o total', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', COM_FRETE), { ok: true, dados: undefined })
  const [pedido] = await pedidosDaMoto(a.motoId)
  usuario = a.aux
  assert.deepEqual(await efetivarVendaAction(pedido.id as string, 'Cliente sintético', '529.982.247-25', '10000', [{ tipo: 'dinheiro', valor: 10350 }], undefined, a.origemId), { ok: true, dados: undefined })
  const [venda] = await vendaDaMoto(a.motoId)
  assert.deepEqual(await execRows(sql`select valor from lancamentos_caixa where venda_id = ${venda.id}`), [{ valor: '10350.00' }])
})

test('frete com modalidade em que a loja não faz o frete é recusado e nada é gravado', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', { ...COM_FRETE, modalidade: 'ContratacaoPorContaDoDestinatario' }),
    { ok: false, erro: 'O frete cobrado só vale com "Loja leva com veículo próprio" ou "Loja contrata e paga a transportadora".' })
  assert.deepEqual(await pedidosDaMoto(a.motoId), [])
})

test('Conta B não efetiva o pedido com frete da Conta A: mesma frase, frete da A intacto e nenhuma venda', async () => {
  const a = await semearConta()
  const b = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', COM_FRETE), { ok: true, dados: undefined })
  const [pedido] = await pedidosDaMoto(a.motoId)
  usuario = b.aux
  assert.deepEqual(await efetivar(pedido.id as string, b.origemId), { ok: false, erro: 'Pedido não encontrado' })
  assert.deepEqual((await pedidosDaMoto(a.motoId))[0].entrega, COM_FRETE)
  assert.deepEqual(await vendasDaMoto(a.motoId), [])
})

// O item moto do pedido (#774) guarda só a moto: o frete fica na Entrega e no total da venda (#726, 4b; #779 decide item "frete").
const itemDaMoto = (motoId: string) => execRows(sql`select i.valor_unitario from pedidos_venda_itens i join pedidos_venda p on p.id = i.pedido_venda_id
  where p.moto_id = ${motoId} and i.tipo = 'moto'`)

test('efetivar com frete: o item moto vale a moto e a venda vale moto + frete; editar a venda mantém o frete fora do item', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', COM_FRETE), { ok: true, dados: undefined })
  const [pedido] = await pedidosDaMoto(a.motoId)
  usuario = a.aux
  assert.deepEqual(await efetivarVendaAction(pedido.id as string, 'Cliente sintético', '529.982.247-25', '10000', [{ tipo: 'pix', valor: 10350 }], undefined, a.origemId), { ok: true, dados: undefined })
  assert.deepEqual(await itemDaMoto(a.motoId), [{ valor_unitario: '10000.00' }])
  const [venda] = await vendaDaMoto(a.motoId)
  assert.equal(Number(venda.valor), 10350)

  usuario = a.socio
  assert.deepEqual(await editarVendaAction(venda.id as string, {
    valor: '11350', dataVenda: '2026-11-07', pagamentos: [{ tipo: 'pix', valor: 11350 }],
    clienteNome: 'Cliente sintético', clienteCpf: '52998224725',
  }), { ok: true, dados: undefined })
  assert.deepEqual(await itemDaMoto(a.motoId), [{ valor_unitario: '11000.00' }])
  assert.equal(Number((await vendaDaMoto(a.motoId))[0].valor), 11350)
  assert.deepEqual(await execRows(sql`select count(*)::int as n from pedidos_venda_itens i join pedidos_venda p on p.id = i.pedido_venda_id
    where p.moto_id = ${a.motoId} and i.tipo = 'frete'`), [{ n: 0 }])

  // Valor que não cobre o frete: o item moto fica sem valor (nunca negativo ou zero); a prévia da NF trava com a pendência.
  assert.deepEqual(await editarVendaAction(venda.id as string, {
    valor: '300', dataVenda: '2026-11-07', pagamentos: [{ tipo: 'pix', valor: 300 }],
    clienteNome: 'Cliente sintético', clienteCpf: '52998224725',
  }), { ok: true, dados: undefined })
  assert.deepEqual(await itemDaMoto(a.motoId), [{ valor_unitario: null }])
})

// Trava da entrega em outro estado (#848): a UF do emitente vem da Nota Gateway (Consultar Empresa), mockada só no fetch.
const ENTREGAR_MG = { ...ENTREGAR, endereco: { ...ENTREGAR.endereco, cidade: '3170701', nomeCidade: 'Varginha', uf: 'MG' } }

async function ligarNg(grupoId: string, empresaId: string) {
  const { cifrar } = await import('@/lib/cripto')
  await db.execute(sql`insert into notagateway_config (grupo_id, token, empresa_id, ambiente)
    values (${grupoId}, ${cifrar('credencial-sintetica')}, ${empresaId}, 'Homologacao')`)
}

/** NG sintética: cada empresaId responde a sua UF; `status` força erro. Devolve as chamadas feitas. */
function ngComUf(ufs: Record<string, string>, status = 200) {
  const chamadas: string[] = []
  mock.method(globalThis, 'fetch', async (input: string | URL | Request) => {
    const path = new URL(String(input)).pathname
    chamadas.push(path)
    if (status !== 200) return new Response('{}', { status })
    const empresa = path.split('/').pop() ?? ''
    return Response.json({ endereco: { uf: ufs[empresa] } })
  })
  return chamadas
}
afterEach(() => mock.restoreAll())

async function contaComNg(uf = 'MG') {
  const a = await semearConta()
  const [{ grupo_id }] = await execRows(sql`select l.grupo_id from motos m join lojas l on l.id = m.loja_id where m.id = ${a.motoId}`)
  const empresa = `empresa-${randomUUID()}`
  await ligarNg(grupo_id as string, empresa)
  return { ...a, grupoId: grupo_id as string, empresa, chamadas: ngComUf({ [empresa]: uf }) }
}

test('trava #848: "Entregar" em outra UF que a do emitente é recusado com a frase e nada é gravado', async () => {
  const a = await contaComNg('MG')
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', ENTREGAR), { ok: false, erro: ENTREGA_EM_OUTRO_ESTADO })
  assert.deepEqual(await pedidosDaMoto(a.motoId), [])
  assert.deepEqual(await execRows(sql`select disponibilidade from motos where id = ${a.motoId}`), [{ disponibilidade: 'disponivel' }])
})

test('trava #848: "Entregar" na UF do emitente grava como antes', async () => {
  const a = await contaComNg('MG')
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', ENTREGAR_MG), { ok: true, dados: undefined })
  assert.deepEqual((await pedidosDaMoto(a.motoId)).map(p => p.entrega), [ENTREGAR_MG])
})

test('trava #848: "Retira na loja" grava sem consultar a Nota Gateway', async () => {
  const a = await contaComNg('MG')
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', RETIRA), { ok: true, dados: undefined })
  assert.deepEqual(a.chamadas, [])
})

test('trava #848: grupo sem a NG configurada: o pedido "Entregar" é gravado sem consultar a NG', async () => {
  const semNg = await semearConta()
  const chamadas = ngComUf({})
  usuario = semNg.vendedor
  assert.deepEqual(await criarPedidoVendaAction(semNg.motoId, '', ENTREGAR), { ok: true, dados: undefined })
  assert.deepEqual(chamadas, [])
  assert.equal((await pedidosDaMoto(semNg.motoId)).length, 1)
})

test('trava #848: NG respondendo erro (500): o pedido "Entregar" é gravado', async () => {
  const comErro = await contaComNg('MG')
  mock.restoreAll()
  const chamadas = ngComUf({}, 500)
  usuario = comErro.vendedor
  assert.deepEqual(await criarPedidoVendaAction(comErro.motoId, '', ENTREGAR), { ok: true, dados: undefined })
  assert.equal(chamadas.length, 1)
  assert.equal((await pedidosDaMoto(comErro.motoId)).length, 1)
})

test('trava #848: Conta B na moto da Conta A recebe a frase de moto inexistente, sem consultar a NG', async () => {
  const a = await contaComNg('MG')
  const b = await semearConta()
  usuario = b.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', ENTREGAR), { ok: false, erro: 'Moto não encontrada' })
  assert.deepEqual(a.chamadas, [])
  assert.deepEqual(await pedidosDaMoto(a.motoId), [])
})

test('trava #848: moto comprada por outro CNPJ da Conta usa a UF dele, não a da loja (#552)', async () => {
  const a = await contaComNg('MA')
  const sufixo = randomUUID()
  const [{ conta_id }] = await execRows(sql`select conta_id from grupos where id = ${a.grupoId}`)
  const { grupoId: entradaId } = await semearGrupo(db, conta_id as string, { prefixo: 'EV848', nome: sufixo, cnpj: sufixo })
  const empresaEntrada = `empresa-${sufixo}`
  await ligarNg(entradaId, empresaEntrada)
  await db.execute(sql`update contas set transferencia_entre_grupos = true where id = ${conta_id}`)
  await db.execute(sql`update motos set grupo_entrada_id = ${entradaId} where id = ${a.motoId}`)
  mock.restoreAll()
  ngComUf({ [a.empresa]: 'MA', [empresaEntrada]: 'MG' })
  usuario = a.vendedor
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', ENTREGAR), { ok: false, erro: ENTREGA_EM_OUTRO_ESTADO })
  assert.deepEqual(await pedidosDaMoto(a.motoId), [])
})

test('trava #848: NG que não responde não segura o pedido: grava em poucos segundos, sem a trava', async () => {
  const a = await contaComNg('MG')
  mock.restoreAll()
  // Só larga quando o próprio pedido desiste (signal); sem limite de tempo, ficaria pendurado para sempre.
  mock.method(globalThis, 'fetch', (_input: unknown, init?: RequestInit) => new Promise((_ok, falha) => {
    init?.signal?.addEventListener('abort', () => falha(init.signal?.reason))
  }))
  usuario = a.vendedor
  const inicio = Date.now()
  assert.deepEqual(await criarPedidoVendaAction(a.motoId, '', ENTREGAR), { ok: true, dados: undefined })
  assert.ok(Date.now() - inicio < 6000, `demorou ${Date.now() - inicio} ms`)
  assert.equal((await pedidosDaMoto(a.motoId)).length, 1)
})

// "Vender" do Showroom (#852): a mesma Entrega e a mesma trava do Novo pedido, direto na venda.
const vendaDoShowroom = (c: Awaited<ReturnType<typeof semearConta>>, entrega: unknown, tipo = 'pix') => ({
  motoId: c.motoId, clienteNome: 'Cliente sintético', clienteCpf: '52998224725', clienteCelular: '35999990774', clienteEmail: 'c@example.com',
  clienteCep: '', clienteLogradouro: '', clienteNumero: '', clienteComplemento: '', clienteBairro: '', clienteCidade: '', clienteEstado: 'MG',
  valorTotal: '12000', pagamentos: [{ tipo, valor: 12000 }], origemId: c.origemId, entrega: entrega as EntregaVenda,
})
const entregaDoPedidoDaMoto = async (motoId: string) => (await pedidosDaMoto(motoId)).map(p => p.entrega)
const aprovadorDeTransferencia = (c: Awaited<ReturnType<typeof contaComNg>>) =>
  ({ ...c.socio, aprovaPagamentoSensivel: true, gruposAprovacao: [c.grupoId] })

test('Vender: "Retira na loja" chega à venda e ao pedido sem consultar a Nota Gateway', async () => {
  const a = await contaComNg('MG')
  usuario = a.vendedor
  assert.equal((await registrarVendaCompletaAction(vendaDoShowroom(a, RETIRA))).ok, true)
  assert.deepEqual((await vendasDaMoto(a.motoId)).map(v => v.entrega), [RETIRA])
  assert.deepEqual(await entregaDoPedidoDaMoto(a.motoId), [RETIRA])
  assert.deepEqual(a.chamadas, [])
})

test('Vender: "Entregar" na UF do emitente grava; a venda lida para a NF traz a Entrega, que fica dentro do estado mesmo com o comprador de outra UF', async () => {
  const a = await contaComNg('MG')
  usuario = a.vendedor
  assert.equal((await registrarVendaCompletaAction(vendaDoShowroom(a, ENTREGAR_MG))).ok, true)
  const venda = await vendaDoUsuarioParaNf(a.aux, eq(vendas.motoId, a.motoId))
  assert.deepEqual(venda?.entrega, ENTREGAR_MG)
  assert.equal(operacaoDaVenda({ entrega: venda!.entrega, ufEmitente: 'MG', ufCliente: 'SP', clienteContribuinte: false, ciclomotor: false }).interestadual, false)
})

test('Vender: "Entregar" em outra UF que a do emitente é recusado com a frase e nada é gravado', async () => {
  const a = await contaComNg('MG')
  usuario = a.vendedor
  assert.deepEqual(await registrarVendaCompletaAction(vendaDoShowroom(a, ENTREGAR)), { ok: false, erro: ENTREGA_EM_OUTRO_ESTADO })
  assert.deepEqual(await vendasDaMoto(a.motoId), [])
  assert.deepEqual(await execRows(sql`select disponibilidade from motos where id = ${a.motoId}`), [{ disponibilidade: 'disponivel' }])
})

test('Vender: NG respondendo erro (500) não segura a venda: "Entregar" é gravado', async () => {
  const a = await contaComNg('MG')
  mock.restoreAll()
  const chamadas = ngComUf({}, 500)
  usuario = a.vendedor
  assert.equal((await registrarVendaCompletaAction(vendaDoShowroom(a, ENTREGAR))).ok, true)
  assert.equal(chamadas.length, 1)
  assert.deepEqual((await vendasDaMoto(a.motoId)).map(v => v.entrega), [ENTREGAR])
})

test('Vender: modalidade fora da lista é recusada e nada é gravado', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  const r = await registrarVendaCompletaAction(vendaDoShowroom(a, { modo: 'retira', modalidade: 'Inventada' }))
  assert.equal(r.ok, false)
  assert.deepEqual(await vendasDaMoto(a.motoId), [])
})

test('Vender: Conta B na moto da Conta A recebe a frase de moto inexistente, sem consultar a NG nem gravar', async () => {
  const a = await contaComNg('MG')
  const b = await semearConta()
  usuario = b.vendedor
  assert.deepEqual(await registrarVendaCompletaAction(vendaDoShowroom({ ...b, motoId: a.motoId }, ENTREGAR)), { ok: false, erro: 'Moto não encontrada' })
  assert.deepEqual(a.chamadas, [])
  assert.deepEqual(await vendasDaMoto(a.motoId), [])
})

test('Vender com aprovação: o pedido guarda a Entrega e a venda aprovada a recebe, sem consultar a NG de novo', async () => {
  const a = await contaComNg('MG')
  usuario = a.vendedor
  assert.deepEqual(await solicitarAprovacaoVendaAction(vendaDoShowroom(a, ENTREGAR_MG, 'transferencia'), '', 'pagamento_sensivel'), { ok: true, dados: undefined })
  const [{ id }] = await execRows(sql`select id from aprovacoes_venda where moto_id = ${a.motoId} and status = 'pendente'`)
  const consultasAntes = a.chamadas.length
  usuario = aprovadorDeTransferencia(a)
  assert.deepEqual(await aprovarVendaAction(id as string), { ok: true, dados: undefined })
  assert.equal(a.chamadas.length, consultasAntes)
  assert.deepEqual((await vendasDaMoto(a.motoId)).map(v => v.entrega), [ENTREGAR_MG])
})

test('Vender com aprovação: "Entregar" em outra UF é recusado já no pedido de aprovação, sem nada gravado', async () => {
  const a = await contaComNg('MG')
  usuario = a.vendedor
  assert.deepEqual(await solicitarAprovacaoVendaAction(vendaDoShowroom(a, ENTREGAR, 'transferencia'), '', 'pagamento_sensivel'), { ok: false, erro: ENTREGA_EM_OUTRO_ESTADO })
  assert.deepEqual(await execRows(sql`select id from aprovacoes_venda where moto_id = ${a.motoId}`), [])
})

test('Vender com aprovação: pedido de aprovação de antes da Entrega vira venda com a Entrega vazia', async () => {
  const a = await contaComNg('MG')
  const { entrega: _semEntrega, ...antigo } = vendaDoShowroom(a, RETIRA, 'transferencia')
  const id = await idDe(sql`insert into aprovacoes_venda (moto_id, loja_id, vendedor_id, valor, dados_venda, motivo, tipo, disponibilidade_anterior, status)
    select ${a.motoId}, loja_id, ${a.vendedor.id}, '12000', ${JSON.stringify(antigo)}::jsonb, 'Pagamento via Transferência Bancária', 'pagamento_sensivel', 'disponivel', 'pendente'
    from motos where id = ${a.motoId} returning id`)
  usuario = aprovadorDeTransferencia(a)
  assert.deepEqual(await aprovarVendaAction(id), { ok: true, dados: undefined })
  assert.deepEqual((await vendasDaMoto(a.motoId)).map(v => v.entrega), [null])
})

test('Vender: NG que não responde não segura a venda: "Entregar" grava em poucos segundos, sem a trava', async () => {
  const a = await contaComNg('MG')
  mock.restoreAll()
  // Só larga quando a própria venda desiste (signal), como no Novo pedido.
  mock.method(globalThis, 'fetch', (_input: unknown, init?: RequestInit) => new Promise((_ok, falha) => {
    init?.signal?.addEventListener('abort', () => falha(init.signal?.reason))
  }))
  usuario = a.vendedor
  const inicio = Date.now()
  assert.equal((await registrarVendaCompletaAction(vendaDoShowroom(a, ENTREGAR))).ok, true)
  assert.ok(Date.now() - inicio < 6000, `demorou ${Date.now() - inicio} ms`)
  assert.deepEqual((await vendasDaMoto(a.motoId)).map(v => v.entrega), [ENTREGAR])
})

test('Vender com aprovação: Conta B não pede aprovação na moto da Conta A nem aprova a solicitação da A; a Entrega da A fica intacta', async () => {
  const a = await contaComNg('MG')
  const b = await contaComNg('MG')
  usuario = b.vendedor
  assert.deepEqual(
    await solicitarAprovacaoVendaAction(vendaDoShowroom({ ...b, motoId: a.motoId }, ENTREGAR_MG, 'transferencia'), '', 'pagamento_sensivel'),
    { ok: false, erro: 'Moto não encontrada' },
  )
  assert.deepEqual(a.chamadas, [])

  usuario = a.vendedor
  assert.equal((await solicitarAprovacaoVendaAction(vendaDoShowroom(a, ENTREGAR_MG, 'transferencia'), '', 'pagamento_sensivel')).ok, true)
  const [{ id }] = await execRows(sql`select id from aprovacoes_venda where moto_id = ${a.motoId} and status = 'pendente'`)
  usuario = aprovadorDeTransferencia(b)
  assert.deepEqual(await aprovarVendaAction(id as string), { ok: false, erro: 'Solicitação não encontrada' })
  assert.deepEqual(await aprovarVendaAction(randomUUID()), { ok: false, erro: 'Solicitação não encontrada' })
  assert.deepEqual(await vendasDaMoto(a.motoId), [])
  assert.deepEqual(await execRows(sql`select status, dados_venda->'entrega' as entrega from aprovacoes_venda where id = ${id}`), [{ status: 'pendente', entrega: ENTREGAR_MG }])
})

// ─── Alterar a Entrega (#895): na efetivação muda o pedido; depois da venda, a venda, com frete fixo e a trava da NF viva.
const NAO_ACHOU_PEDIDO = { ok: false, erro: 'Pedido não encontrado' }
const NAO_ACHOU_VENDA = { ok: false, erro: 'Venda não encontrada' }
const logDaAlteracao = (id: string) => execRows(sql`select detalhe from log_acoes where tipo = 'entrega_alterada' and (detalhe->>'pedidoId' = ${id} or detalhe->>'vendaId' = ${id})`)

async function vendaEfetivada(c: Awaited<ReturnType<typeof semearConta>>, entrega: unknown = RETIRA, total = 1000) {
  usuario = c.vendedor
  assert.deepEqual(await criarPedidoVendaAction(c.motoId, '', entrega), { ok: true, dados: undefined })
  const [pedido] = await pedidosDaMoto(c.motoId)
  usuario = c.aux
  assert.deepEqual(await efetivarVendaAction(pedido.id as string, 'Cliente sintético', '529.982.247-25', '1000', [{ tipo: 'pix', valor: total }], undefined, c.origemId), { ok: true, dados: undefined })
  const [venda] = await execRows(sql`select v.id, v.numero, l.grupo_id from vendas v join lojas l on l.id = v.loja_id where v.moto_id = ${c.motoId}`)
  return { id: venda.id as string, numero: venda.numero as number, grupoId: venda.grupo_id as string }
}

// Autorizada há 1 hora por padrão: dentro das 24h, a trava é "cancele a NF".
const semearNota = (v: { id: string; numero: number; grupoId: string }, ambiente: string, status: string, autorizadaEm: string | null = new Date(Date.now() - 3600_000).toISOString()) =>
  execRows(sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, data_autorizacao, payload)
    values (${v.id}, ${v.numero}, ${v.grupoId}, ${randomUUID()}, ${ambiente}, ${status}, ${autorizadaEm}, '{}'::jsonb)`)

test('Alterar na efetivação: o pedido ganha a Entrega nova, a venda nasce com ela e o total segue o frete novo; o log guarda antes e depois', async () => {
  const a = await semearConta()
  const pedidoId = await criarPedido(a)
  usuario = a.aux
  assert.deepEqual(await alterarEntregaDoPedidoAction(pedidoId, COM_FRETE), { ok: true, dados: undefined })
  assert.deepEqual(await entregaDoPedidoDaMoto(a.motoId), [COM_FRETE])
  assert.deepEqual(await efetivarVendaAction(pedidoId, 'Cliente sintético', '529.982.247-25', '1000', [{ tipo: 'pix', valor: 1350 }], undefined, a.origemId), { ok: true, dados: undefined })
  const [venda] = await vendaDaMoto(a.motoId)
  assert.equal(Number(venda.valor), 1350)
  assert.deepEqual(await logDaAlteracao(pedidoId), [{ detalhe: {
    pedidoId,
    antes: { modo: 'retira', uf: null, modalidade: RETIRA.modalidade, frete: 0 },
    depois: { modo: 'entregar', uf: 'MA', modalidade: COM_FRETE.modalidade, frete: 350 },
  } }])
  // O log fica no grupo e na Conta do pedido, com quem alterou.
  const [{ grupo_id }] = await execRows(sql`select grupo_id from lojas where id = ${a.aux.lojaId}`)
  assert.deepEqual(await execRows(sql`select usuario_id, grupo_id, conta_id from log_acoes where tipo = 'entrega_alterada' and detalhe->>'pedidoId' = ${pedidoId}`),
    [{ usuario_id: a.aux.id, grupo_id, conta_id: a.aux.contaId }])
})

test('Alterar na efetivação: vendedor (não efetiva) é recusado e o pedido não muda', async () => {
  const a = await semearConta()
  const pedidoId = await criarPedido(a)
  assert.deepEqual(await alterarEntregaDoPedidoAction(pedidoId, COM_FRETE), { ok: false, erro: 'Sem permissão para mudar a entrega' })
  assert.deepEqual(await entregaDoPedidoDaMoto(a.motoId), [RETIRA])
})

test('Alterar na efetivação: Conta B recebe a frase de pedido inexistente e o pedido da A não muda', async () => {
  const a = await semearConta()
  const b = await semearConta()
  const pedidoId = await criarPedido(a)
  usuario = b.aux
  assert.deepEqual(await alterarEntregaDoPedidoAction(pedidoId, COM_FRETE), NAO_ACHOU_PEDIDO)
  assert.deepEqual(await alterarEntregaDoPedidoAction(randomUUID(), COM_FRETE), NAO_ACHOU_PEDIDO)
  assert.deepEqual(await entregaDoPedidoDaMoto(a.motoId), [RETIRA])
  assert.deepEqual(await logDaAlteracao(pedidoId), [])
})

test('Alterar na efetivação: pedido aguardando aprovação é recusado com a frase e não muda', async () => {
  const a = await semearConta()
  const pedidoId = await criarPedido(a)
  usuario = a.aux
  // Transferência sem a permissão de pagamento sensível: o pedido vai para aprovação, como no balcão.
  assert.deepEqual(await efetivarVendaAction(pedidoId, 'Cliente sintético', '529.982.247-25', '1000', [{ tipo: 'transferencia', valor: 1000 }], undefined, a.origemId, undefined, 'conferir'),
    { ok: true, dados: { aprovacao: 'pagamento_sensivel' } })
  assert.deepEqual(await alterarEntregaDoPedidoAction(pedidoId, COM_FRETE), { ok: false, erro: PEDIDO_EM_APROVACAO_PARA_ALTERAR })
  assert.deepEqual(await entregaDoPedidoDaMoto(a.motoId), [RETIRA])
})

test('Alterar na efetivação: pedido já efetivado não muda mais por aqui', async () => {
  const a = await semearConta()
  await vendaEfetivada(a)
  const [pedido] = await pedidosDaMoto(a.motoId)
  assert.deepEqual(await alterarEntregaDoPedidoAction(pedido.id as string, COM_FRETE), { ok: false, erro: 'Este pedido não está mais pendente. Recarregue a página.' })
  assert.deepEqual(await entregaDoPedidoDaMoto(a.motoId), [RETIRA])
})

test('Alterar na efetivação: "Entregar" em outra UF que a do emitente é recusado com a frase da #848', async () => {
  const a = await contaComNg('MG')
  const pedidoId = await criarPedido(a)
  usuario = a.aux
  assert.deepEqual(await alterarEntregaDoPedidoAction(pedidoId, ENTREGAR), { ok: false, erro: ENTREGA_EM_OUTRO_ESTADO })
  assert.deepEqual(await alterarEntregaDoPedidoAction(pedidoId, ENTREGAR_MG), { ok: true, dados: undefined })
})

test('Alterar depois da venda: muda endereço e quem recebe com o mesmo frete; o log guarda antes e depois', async () => {
  const a = await semearConta()
  const v = await vendaEfetivada(a, COM_FRETE, 1350)
  const nova = { ...COM_FRETE, endereco: { ...COM_FRETE.endereco, logradouro: 'Outra rua' }, recebe: null }
  assert.deepEqual(await alterarEntregaDaVendaAction(v.id, nova), { ok: true, dados: undefined })
  assert.deepEqual(await vendasDaMoto(a.motoId), [{ entrega: nova }])
  assert.equal((await logDaAlteracao(v.id)).length, 1)
})

test('Alterar depois da venda: com frete não vira Retira; sem frete não ganha frete; nada muda', async () => {
  const a = await semearConta()
  const comFrete = await vendaEfetivada(a, COM_FRETE, 1350)
  assert.deepEqual(await alterarEntregaDaVendaAction(comFrete.id, RETIRA), { ok: false, erro: FRETE_FIXO_NA_VENDA })
  assert.deepEqual(await vendasDaMoto(a.motoId), [{ entrega: COM_FRETE }])

  const b = await semearConta()
  const semFrete = await vendaEfetivada(b)
  assert.deepEqual(await alterarEntregaDaVendaAction(semFrete.id, COM_FRETE), { ok: false, erro: SEM_FRETE_NA_VENDA })
  assert.deepEqual(await vendasDaMoto(b.motoId), [{ entrega: RETIRA }])
})

test('Alterar depois da venda: NF de produção viva trava com a orientação de cada situação, e nada muda', async () => {
  const casos: [string, string][] = [
    ['Enviando', TRAVA_DO_ALTERAR.emissao_em_andamento], ['Processando', TRAVA_DO_ALTERAR.emissao_em_andamento],
    ['Autorizada', CANCELE_A_NF_PARA_ALTERAR], ['CancelamentoNegado', TRAVA_DO_ALTERAR.tentar_de_novo],
    ['EmProcessoDeCancelamento', TRAVA_DO_ALTERAR.cancelamento_em_andamento],
  ]
  for (const [status, frase] of casos) {
    const a = await semearConta()
    const v = await vendaEfetivada(a)
    await semearNota(v, 'Producao', status)
    assert.deepEqual(await alterarEntregaDaVendaAction(v.id, ENTREGAR), { ok: false, erro: frase }, status)
    assert.deepEqual(await vendasDaMoto(a.motoId), [{ entrega: RETIRA }])
  }
})

test('Alterar depois da venda: uma nota recusada e outra autorizada na mesma venda: a viva trava', async () => {
  const a = await semearConta()
  const v = await vendaEfetivada(a)
  await semearNota(v, 'Producao', 'Negada', null)
  await semearNota(v, 'Producao', 'Autorizada')
  assert.deepEqual(await alterarEntregaDaVendaAction(v.id, ENTREGAR), { ok: false, erro: CANCELE_A_NF_PARA_ALTERAR })
})

test('Alterar depois da venda: NF de homologação, recusada ou cancelada libera', async () => {
  for (const [ambiente, status] of [['Homologacao', 'Autorizada'], ['Producao', 'Negada'], ['Producao', 'Denegada'], ['Producao', 'Cancelada'], ['Producao', 'Descartada']]) {
    const a = await semearConta()
    const v = await vendaEfetivada(a)
    await semearNota(v, ambiente, status)
    assert.deepEqual(await alterarEntregaDaVendaAction(v.id, ENTREGAR), { ok: true, dados: undefined }, `${ambiente} ${status}`)
  }
})

test('Alterar depois da venda: Conta B recebe a frase de venda inexistente e a venda da A não muda', async () => {
  const a = await semearConta()
  const b = await semearConta()
  const v = await vendaEfetivada(a)
  usuario = b.aux
  assert.deepEqual(await alterarEntregaDaVendaAction(v.id, ENTREGAR), NAO_ACHOU_VENDA)
  assert.deepEqual(await alterarEntregaDaVendaAction(randomUUID(), ENTREGAR), NAO_ACHOU_VENDA)
  assert.deepEqual(await vendasDaMoto(a.motoId), [{ entrega: RETIRA }])
  assert.deepEqual(await logDaAlteracao(v.id), [])
})

test('Alterar depois da venda: "Entregar" em outra UF que a do emitente é recusado com a frase da #848', async () => {
  const a = await contaComNg('MG')
  const v = await vendaEfetivada(a)
  assert.deepEqual(await alterarEntregaDaVendaAction(v.id, ENTREGAR), { ok: false, erro: ENTREGA_EM_OUTRO_ESTADO })
  assert.deepEqual(await vendasDaMoto(a.motoId), [{ entrega: RETIRA }])
})

test('Alterar depois da venda: vendedor (não opera a NF) é recusado e a venda não muda', async () => {
  const a = await semearConta()
  const v = await vendaEfetivada(a)
  usuario = a.vendedor
  assert.deepEqual(await alterarEntregaDaVendaAction(v.id, ENTREGAR), { ok: false, erro: 'Sem permissão para mudar a entrega' })
  assert.deepEqual(await vendasDaMoto(a.motoId), [{ entrega: RETIRA }])
})

test('Alterar: admin_rede (persona real) altera o pedido do grupo liberado; a venda de um grupo não liberado dá "não encontrada" e não muda', async () => {
  const { usuarioDaRede } = await import('@/lib/grupos-liberados')
  const casa = await semearConta()
  const liberado = await semearConta()
  const naoLiberado = await semearConta()
  const [{ grupo_id: grupoLiberado }] = await execRows(sql`select grupo_id from lojas where id = ${liberado.aux.lojaId}`)
  const rede = { id: casa.socio.id, papel: 'admin_rede', lojaId: casa.aux.lojaId, contaId: casa.aux.contaId, gruposAcesso: [] as string[], gruposAprovacao: [] as string[] }
  const vivos = [{ grupoId: grupoLiberado as string, contaId: liberado.aux.contaId }]

  const pedidoLiberado = await criarPedido(liberado)
  const vendaNaoLiberada = await vendaEfetivada(naoLiberado)

  usuario = usuarioDaRede(rede, vivos, grupoLiberado as string)
  assert.deepEqual(await alterarEntregaDoPedidoAction(pedidoLiberado, COM_FRETE), { ok: true, dados: undefined })
  assert.deepEqual(await entregaDoPedidoDaMoto(liberado.motoId), [COM_FRETE])

  const [{ grupo_id: grupoNaoLiberado }] = await execRows(sql`select grupo_id from lojas where id = ${naoLiberado.aux.lojaId}`)
  usuario = usuarioDaRede(rede, vivos, grupoNaoLiberado as string)
  assert.deepEqual(await alterarEntregaDaVendaAction(vendaNaoLiberada.id, ENTREGAR), NAO_ACHOU_VENDA)
  assert.deepEqual(await vendasDaMoto(naoLiberado.motoId), [{ entrega: RETIRA }])
})

test('Alterar depois da venda: a leitura da NF passa a ver a Entrega nova e a operação da nota sai dela', async () => {
  const a = await contaComNg('MG')
  const v = await vendaEfetivada(a)
  const operacao = async () => operacaoDaVenda({ entrega: (await vendaDoUsuarioParaNf(a.aux, eq(vendas.id, v.id)))!.entrega, ufEmitente: 'MG', ufCliente: 'SP', clienteContribuinte: false, ciclomotor: false })
  const antes = await operacao()
  assert.deepEqual(await alterarEntregaDaVendaAction(v.id, ENTREGAR_MG), { ok: true, dados: undefined })
  const depois = await operacao()
  assert.deepEqual([antes.motivo, depois.motivo], ['retira', 'entregar'])
  assert.deepEqual([antes.interestadual, depois.interestadual], [false, false])
})

test('Alterar depois da venda: duas alterações ao mesmo tempo ficam em fila; o log da segunda parte do que a primeira gravou', async () => {
  const a = await semearConta()
  const v = await vendaEfetivada(a)
  const ma = ENTREGAR
  const mg = { ...ENTREGAR_MG }
  const r = await Promise.all([alterarEntregaDaVendaAction(v.id, ma), alterarEntregaDaVendaAction(v.id, mg)])
  assert.deepEqual(r, [{ ok: true, dados: undefined }, { ok: true, dados: undefined }])
  const logs = (await logDaAlteracao(v.id)).map(l => l.detalhe as { antes: { modo: string; uf: string | null }; depois: { uf: string } })
  assert.equal(logs.length, 2)
  // Uma partiu da retirada; a outra, da Entrega que a primeira gravou (nunca as duas da retirada).
  assert.deepEqual(logs.map(l => l.antes.modo).sort(), ['entregar', 'retira'])
  const segunda = logs.find(l => l.antes.modo === 'entregar')!
  const primeira = logs.find(l => l.antes.modo === 'retira')!
  assert.equal(segunda.antes.uf, primeira.depois.uf)
})

test('Alterar depois da venda: venda apagada enquanto o Alterar esperava o lock responde "Venda não encontrada"', async () => {
  const a = await semearConta()
  const v = await vendaEfetivada(a)
  let soltar!: () => void
  const solta = new Promise<void>(r => { soltar = r })
  let travou!: () => void
  const travada = new Promise<void>(r => { travou = r })
  // Outra transação segura a venda, apaga e só então libera: o Alterar já passou da leitura e espera no lock.
  const apagando = db.transaction(async tx => {
    await tx.execute(sql`select id from vendas where id = ${v.id} for update`)
    travou()
    await solta
    await tx.execute(sql`delete from vendas where id = ${v.id}`)
  })
  await travada
  const alterando = alterarEntregaDaVendaAction(v.id, ENTREGAR)
  try {
    // Espera o Alterar ficar parado no lock da linha da venda, não um tempo fixo.
    const esperandoLock = async () => (await execRows(sql`select 1 from pg_stat_activity
      where wait_event_type = 'Lock' and query ilike '%from "vendas"%for update%'`)).length > 0
    for (let i = 0; i < 500 && !(await esperandoLock()); i++) await new Promise(r => setImmediate(r))
    assert.equal(await esperandoLock(), true, 'o Alterar não chegou ao lock da venda')
  } finally {
    soltar()
    await apagando
  }
  assert.deepEqual(await alterando, NAO_ACHOU_VENDA)
})
