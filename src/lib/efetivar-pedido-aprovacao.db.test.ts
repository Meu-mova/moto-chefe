// Teste de banco do preço mínimo e da aprovação na efetivação do pedido (#776): mesmas regras do
// Vender; o pedido fica pendente com um pedido de aprovação (origem 'pedido') e a moto aguardando.
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

type Usuario = { id: string; papel: string; lojaId: string; contaId: string; gruposAcesso: string[]; aprovaPagamentoSensivel?: boolean; gruposAprovacao?: string[] }
let usuario: Usuario

const authMock = mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
const cacheMock = mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })

type Db = typeof import('@/lib/db')
type Actions = typeof import('@/app/(dashboard)/vendas/actions')
let db: Db['db']
let execRows: Db['execRows']
let actions: Actions
let listarAprovacoesPendentes: typeof import('@/lib/queries/motos')['listarAprovacoesPendentes']

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  actions = await import('@/app/(dashboard)/vendas/actions')
  ;({ listarAprovacoesPendentes } = await import('@/lib/queries/motos'))
})
after(async () => {
  authMock.restore()
  cacheMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const idDe = async (q: ReturnType<typeof sql>) => (await execRows(q))[0].id as string
const RETIRA = { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' } as const
const CPF = '529.982.247-25'
const MINIMO = 12000

async function semearConta() {
  const sufixo = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'AP776', nome: sufixo, cnpj: sufixo })
  const auxId = await semearUsuario(db, base, { papel: 'aux_adm', rotulo: 'aux', comConta: true })
  const vendedorId = await semearUsuario(db, base, { papel: 'vendedor', rotulo: 'vend', comConta: true })
  const socioId = await semearUsuario(db, base, { papel: 'admin_socio', rotulo: 'socio', comConta: true })
  const modelo = 'AP776 ' + sufixo
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${modelo}, 'autopropelido', '1000', 'hub', '32') returning id`)
  await execRows(sql`insert into precificacao (grupo_id, nome, valor_minimo) values (${base.grupoId}, ${modelo}, ${String(MINIMO)})`)
  await execRows(sql`insert into configuracao_taxas (grupo_id) values (${base.grupoId})`)
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${modeloId}, ${base.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  const origemId = await idDe(sql`insert into origens_venda (grupo_id, nome) values (${base.grupoId}, 'Passou na porta') returning id`)
  const comum = { lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [] }
  const socio = { id: socioId, papel: 'admin_socio', ...comum }
  const c = {
    motoId, origemId, lojaId: base.lojaId,
    aux: { id: auxId, papel: 'aux_adm', ...comum },
    vendedor: { id: vendedorId, papel: 'vendedor', ...comum },
    socio,
    // Persona real de quem aprova transferência: a marca no cadastro e o grupo liberado.
    aprovadorTransferencia: { ...socio, aprovaPagamentoSensivel: true, gruposAprovacao: [base.grupoId] },
  }
  usuario = c.vendedor
  assert.deepEqual(await actions.criarPedidoVendaAction(motoId, '', RETIRA), { ok: true, dados: undefined })
  const [pedido] = await execRows(sql`select id from pedidos_venda where moto_id = ${motoId}`)
  return { ...c, pedidoId: pedido.id as string }
}
type Conta = Awaited<ReturnType<typeof semearConta>>

const efetivar = (c: Conta, valor: number, tipo = 'pix', motivo?: string) =>
  actions.efetivarVendaAction(c.pedidoId, 'Cliente sintético', CPF, String(valor), [{ tipo, valor }], undefined, c.origemId, undefined, motivo)

const estado = async (c: Conta) => {
  const [p] = await execRows(sql`select p.status, m.status as moto, m.disponibilidade from pedidos_venda p join motos m on m.id = p.moto_id where p.id = ${c.pedidoId}`)
  const vendas = await execRows(sql`select valor, pagamentos from vendas where moto_id = ${c.motoId}`)
  return { pedido: p.status, moto: p.moto, disponibilidade: p.disponibilidade, vendas: vendas.length }
}
const aprovacoes = (c: Conta) => execRows(sql`select id, origem, tipo, status, valor, valor_minimo_snapshot, liquido_snapshot, disponibilidade_anterior
  from aprovacoes_venda where moto_id = ${c.motoId} order by data_solicitacao`)
const AGUARDANDO = { pedido: 'pendente', moto: 'montada', disponibilidade: 'aguardando_aprovacao', vendas: 0 }

test('D1: aux_adm abaixo do mínimo sem motivo é recusado e nada é gravado', async () => {
  const a = await semearConta()
  usuario = a.aux
  assert.deepEqual(await efetivar(a, MINIMO - 100), { ok: false, erro: 'Informe o motivo do pedido de aprovação' })
  assert.deepEqual(await aprovacoes(a), [])
  assert.deepEqual(await estado(a), { pedido: 'pendente', moto: 'montada', disponibilidade: 'reservada', vendas: 0 })
})

test('D2: aux_adm abaixo do mínimo com motivo: pedido em aprovação de valor mínimo com os snapshots, moto aguardando, sem venda', async () => {
  const a = await semearConta()
  usuario = a.aux
  assert.deepEqual(await efetivar(a, MINIMO - 100, 'pix', 'Cliente fiel'), { ok: true, dados: { aprovacao: 'valor_minimo' } })
  const [ap] = await aprovacoes(a)
  assert.deepEqual({ ...ap, id: undefined }, {
    id: undefined, origem: 'pedido', tipo: 'valor_minimo', status: 'pendente', valor: '11900.00',
    valor_minimo_snapshot: '12000.00', liquido_snapshot: '11900.00', disponibilidade_anterior: 'reservada',
  })
  assert.deepEqual(await estado(a), AGUARDANDO)
})

test('D3: o sócio aprova e a venda sai com o pagamento guardado; aprovar de novo é recusado', async () => {
  const a = await semearConta()
  usuario = a.aux
  await efetivar(a, MINIMO - 100, 'dinheiro', 'Cliente fiel')
  const [{ id }] = await aprovacoes(a)
  usuario = a.socio
  assert.deepEqual(await actions.aprovarVendaAction(id as string), { ok: true, dados: undefined })
  assert.deepEqual(await estado(a), { pedido: 'efetivado', moto: 'vendida', disponibilidade: null, vendas: 1 })
  const [venda] = await execRows(sql`select valor, pagamentos, efetivado_por from vendas where moto_id = ${a.motoId}`)
  assert.deepEqual(venda, { valor: '11900.00', pagamentos: [{ tipo: 'dinheiro', valor: MINIMO - 100 }], efetivado_por: a.socio.id })
  const caixa = await execRows(sql`select l.valor from lancamentos_caixa l join vendas v on v.id = l.venda_id where v.moto_id = ${a.motoId}`)
  assert.deepEqual(caixa, [{ valor: '11900.00' }])
  assert.deepEqual(await actions.aprovarVendaAction(id as string), { ok: false, erro: 'Esta solicitação não está mais pendente. Recarregue a página.' })
})

test('D4: recusado, o pedido volta a pendente, a moto volta a reservada e dá para efetivar de novo', async () => {
  const a = await semearConta()
  usuario = a.aux
  await efetivar(a, MINIMO - 100, 'pix', 'Cliente fiel')
  const [{ id }] = await aprovacoes(a)
  usuario = a.socio
  assert.deepEqual(await actions.recusarVendaAction(id as string, 'Valor baixo'), { ok: true, dados: undefined })
  assert.deepEqual(await estado(a), { pedido: 'pendente', moto: 'montada', disponibilidade: 'reservada', vendas: 0 })
  usuario = a.aux
  assert.deepEqual(await efetivar(a, MINIMO), { ok: true, dados: undefined })
  assert.deepEqual(await estado(a), { pedido: 'efetivado', moto: 'vendida', disponibilidade: null, vendas: 1 })
})

test('D5: enquanto aguarda, efetivar de novo e cancelar o pedido são recusados', async () => {
  const a = await semearConta()
  usuario = a.aux
  await efetivar(a, MINIMO - 100, 'pix', 'Cliente fiel')
  assert.deepEqual(await efetivar(a, MINIMO), { ok: false, erro: 'Esta moto já tem uma venda aguardando aprovação' })
  assert.deepEqual(await actions.cancelarPedidoAction(a.pedidoId), { ok: false, erro: 'Este pedido está aguardando aprovação. Aprove ou recuse antes de cancelar.' })
  assert.deepEqual(await estado(a), AGUARDANDO)
  assert.equal((await aprovacoes(a)).length, 1)
  // O card lê a mesma marca que trava o cancelar.
  const { listarPedidosPorLoja } = await import('@/lib/queries/vendas')
  assert.deepEqual((await listarPedidosPorLoja(a.lojaId)).filter(p => p.id === a.pedidoId).map(p => p.emAprovacao), [true])
})

test('D6: transferência de aux_adm sem a permissão vai para aprovação de pagamento sensível; só quem tem a permissão aprova', async () => {
  const a = await semearConta()
  usuario = a.aux
  assert.deepEqual(await efetivar(a, MINIMO, 'transferencia'), { ok: true, dados: { aprovacao: 'pagamento_sensivel' } })
  const [ap] = await aprovacoes(a)
  assert.deepEqual([ap.origem, ap.tipo, ap.valor_minimo_snapshot], ['pedido', 'pagamento_sensivel', null])
  assert.deepEqual(await estado(a), AGUARDANDO)
  usuario = a.socio
  assert.deepEqual(await actions.aprovarVendaAction(ap.id as string), { ok: false, erro: 'Sem permissão para aprovar esta venda' })
  usuario = a.aprovadorTransferencia
  assert.deepEqual(await actions.aprovarVendaAction(ap.id as string), { ok: true, dados: undefined })
  assert.deepEqual(await estado(a), { pedido: 'efetivado', moto: 'vendida', disponibilidade: null, vendas: 1 })
})

test('D7: sócio abaixo do mínimo efetiva direto (auto-aprovação), sem pedido de aprovação', async () => {
  const a = await semearConta()
  usuario = a.socio
  assert.deepEqual(await efetivar(a, MINIMO - 100), { ok: true, dados: undefined })
  assert.deepEqual(await aprovacoes(a), [])
  assert.deepEqual(await estado(a), { pedido: 'efetivado', moto: 'vendida', disponibilidade: null, vendas: 1 })
})

test('D8: aprovador da Conta B não vê, não aprova nem recusa o pedido da Conta A (mesma frase de inexistente)', async () => {
  const a = await semearConta()
  const b = await semearConta()
  usuario = a.aux
  await efetivar(a, MINIMO - 100, 'pix', 'Cliente fiel')
  const [{ id }] = await aprovacoes(a)
  assert.deepEqual((await listarAprovacoesPendentes([b.lojaId])).filter(l => l.id === id), [])
  usuario = b.socio
  assert.deepEqual(await actions.aprovarVendaAction(id as string), { ok: false, erro: 'Solicitação não encontrada' })
  assert.deepEqual(await actions.recusarVendaAction(id as string), { ok: false, erro: 'Solicitação não encontrada' })
  assert.deepEqual(await actions.aprovarVendaAction(randomUUID()), { ok: false, erro: 'Solicitação não encontrada' })
  assert.deepEqual(await estado(a), AGUARDANDO)
  assert.deepEqual((await aprovacoes(a)).map(p => p.status), ['pendente'])
})

test('D9: com frete, o mínimo compara o líquido sem o frete; a aprovação guarda o valor da moto e o frete, e a venda sai com o total', async () => {
  const a = await semearConta()
  const entrega = { modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente', recebe: null, frete: 150,
    endereco: { cep: '01001000', logradouro: 'Rua Sintética', numero: '1', complemento: '', bairro: 'Centro', cidade: '3550308', nomeCidade: 'São Paulo', uf: 'SP' } }
  await execRows(sql`update pedidos_venda set entrega = ${JSON.stringify(entrega)}::jsonb where id = ${a.pedidoId}`)
  usuario = a.aux
  // Moto 11.900 + frete 150 = 12.050: o total passa do mínimo de 12.000, a moto não.
  const r = await actions.efetivarVendaAction(a.pedidoId, 'Cliente sintético', CPF, '11900', [{ tipo: 'pix', valor: 12050 }], undefined, a.origemId, undefined, 'Cliente fiel')
  assert.deepEqual(r, { ok: true, dados: { aprovacao: 'valor_minimo' } })
  const [ap] = await execRows(sql`select id, valor, liquido_snapshot, dados_venda->'frete' as frete from aprovacoes_venda where moto_id = ${a.motoId}`)
  assert.deepEqual([ap.valor, ap.liquido_snapshot, ap.frete], ['11900.00', '11900.00', 150])
  usuario = a.socio
  assert.deepEqual(await actions.aprovarVendaAction(ap.id as string), { ok: true, dados: undefined })
  assert.deepEqual(await execRows(sql`select valor from vendas where moto_id = ${a.motoId}`), [{ valor: '12050.00' }])
})

test('D10: com frete e a moto no mínimo, efetiva direto', async () => {
  const a = await semearConta()
  await execRows(sql`update pedidos_venda set entrega = ${JSON.stringify({ modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente', recebe: null, frete: 150,
    endereco: { cep: '01001000', logradouro: 'Rua Sintética', numero: '1', complemento: '', bairro: 'Centro', cidade: '3550308', nomeCidade: 'São Paulo', uf: 'SP' } })}::jsonb where id = ${a.pedidoId}`)
  usuario = a.aux
  assert.deepEqual(await actions.efetivarVendaAction(a.pedidoId, 'Cliente sintético', CPF, String(MINIMO), [{ tipo: 'pix', valor: MINIMO + 150 }], undefined, a.origemId), { ok: true, dados: undefined })
  assert.deepEqual(await aprovacoes(a), [])
})
