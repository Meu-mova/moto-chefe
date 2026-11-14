// Teste de banco do frete cobrado no "Vender" do Showroom (#854): o payload traz a moto em `valorTotal` e o
// frete na Entrega; a venda grava moto + frete, o item moto só a moto, e o preço mínimo olha só a moto.
// As actions gravam fora de transação de teste: cada cenário cria a própria Conta e só confere o que criou.
// Grupo sem Nota Gateway configurada: "Entregar" não consulta a NG (trava #848 coberta em entrega-venda-actions).
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import { SOMA_PAGAMENTOS_DIFERE } from '@/lib/pagamentos-entrada'
import { contaDaAprovacao } from '@/lib/aprovacao-venda'
import { freteDaVenda, motoNaNota, pendenciasDaEntrega } from '@/lib/notagateway/entrega'

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
let buscarMoto: typeof import('@/lib/queries/motos')['buscarMoto']
let vendaDoUsuarioParaNf: typeof import('@/lib/venda-do-usuario')['vendaDoUsuarioParaNf']
let vendas: typeof import('@/lib/db/schema')['vendas']
let eq: typeof import('drizzle-orm')['eq']

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  actions = await import('@/app/(dashboard)/vendas/actions')
  ;({ buscarMoto } = await import('@/lib/queries/motos'))
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
const MINIMO = 12000
const FRETE = 150
const ENTREGAR = {
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente', recebe: null, frete: FRETE,
  endereco: { cep: '01001000', logradouro: 'Rua Sintética', numero: '1', complemento: '', bairro: 'Centro', cidade: '3550308', nomeCidade: 'São Paulo', uf: 'SP' },
}

async function semearConta() {
  const sufixo = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'VF854', nome: sufixo, cnpj: sufixo })
  const vendedorId = await semearUsuario(db, base, { papel: 'vendedor', rotulo: 'vend', comConta: true })
  const socioId = await semearUsuario(db, base, { papel: 'admin_socio', rotulo: 'socio', comConta: true })
  const modelo = 'VF854 ' + sufixo
  const modeloId = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${modelo}, 'autopropelido', '1000', 'hub', '32') returning id`)
  await execRows(sql`insert into precificacao (grupo_id, nome, valor_minimo) values (${base.grupoId}, ${modelo}, ${String(MINIMO)})`)
  await execRows(sql`insert into configuracao_taxas (grupo_id) values (${base.grupoId})`)
  const motoId = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${randomUUID()}, ${modeloId}, ${base.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  const origemId = await idDe(sql`insert into origens_venda (grupo_id, nome) values (${base.grupoId}, 'Passou na porta') returning id`)
  const comum = { lojaId: base.lojaId, contaId: base.contaId, gruposAcesso: [] }
  return { motoId, origemId, vendedor: { id: vendedorId, papel: 'vendedor', ...comum }, socio: { id: socioId, papel: 'admin_socio', ...comum } }
}
type Conta = Awaited<ReturnType<typeof semearConta>>

/** Venda do Showroom: `moto` vai em `valorTotal` (#854) e os pagamentos somam o que o teste mandar. */
const venda = (c: Conta, moto: number, pagamentos: { tipo: string; valor: number }[], entrega: unknown = ENTREGAR) => ({
  motoId: c.motoId, clienteNome: 'Cliente sintético', clienteCpf: '52998224725', clienteCelular: '35999990774', clienteEmail: 'c@example.com',
  clienteCep: '', clienteLogradouro: '', clienteNumero: '', clienteComplemento: '', clienteBairro: '', clienteCidade: '', clienteEstado: 'SP',
  valorTotal: String(moto), pagamentos, origemId: c.origemId, entrega: entrega as never,
})

const vendaDaMoto = (motoId: string) => execRows(sql`select id, valor, entrega->'frete' as frete from vendas where moto_id = ${motoId}`)
const itemDaMoto = (motoId: string) => execRows(sql`select i.valor_unitario from pedidos_venda_itens i join pedidos_venda p on p.id = i.pedido_venda_id
  where p.moto_id = ${motoId} and i.tipo = 'moto'`)
const aprovacoesDaMoto = (motoId: string) => execRows(sql`select id, valor, liquido_snapshot, dados_venda->'entrega'->'frete' as frete
  from aprovacoes_venda where moto_id = ${motoId}`)

test('D1: venda com frete grava moto + frete na venda, só a moto no item, e o caixa recebe o dinheiro inteiro', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  const r = await actions.registrarVendaCompletaAction(venda(a, MINIMO, [{ tipo: 'dinheiro', valor: MINIMO + FRETE }]))
  assert.equal(r.ok, true, JSON.stringify(r))
  const [v] = await vendaDaMoto(a.motoId)
  assert.deepEqual([v.valor, v.frete], ['12150.00', FRETE])
  assert.deepEqual(await itemDaMoto(a.motoId), [{ valor_unitario: '12000.00' }])
  assert.deepEqual(await execRows(sql`select valor from lancamentos_caixa where venda_id = ${v.id}`), [{ valor: '12150.00' }])
})

test('D2: com frete, pagamentos que somam só a moto são recusados e nada é gravado', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await actions.registrarVendaCompletaAction(venda(a, MINIMO, [{ tipo: 'pix', valor: MINIMO }])), { ok: false, erro: SOMA_PAGAMENTOS_DIFERE })
  assert.deepEqual(await vendaDaMoto(a.motoId), [])
})

test('D3: o frete não passa a moto do mínimo: moto 11.900 + frete 150 é recusada direto e vai para aprovação com o valor da moto', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  const abaixo = venda(a, MINIMO - 100, [{ tipo: 'pix', valor: MINIMO - 100 + FRETE }])
  const direta = await actions.registrarVendaCompletaAction(abaixo)
  assert.equal(direta.ok, false)
  assert.match(direta.ok ? '' : direta.erro, /^Valor abaixo do mínimo/)
  assert.deepEqual(await vendaDaMoto(a.motoId), [])

  assert.deepEqual(await actions.solicitarAprovacaoVendaAction(abaixo, 'Cliente fiel'), { ok: true, dados: undefined })
  const [ap] = await aprovacoesDaMoto(a.motoId)
  assert.deepEqual([ap.valor, ap.liquido_snapshot, ap.frete], ['11900.00', '11900.00', FRETE])

  usuario = a.socio
  assert.deepEqual(await actions.aprovarVendaAction(ap.id as string), { ok: true, dados: undefined })
  const [v] = await vendaDaMoto(a.motoId)
  assert.deepEqual([v.valor, v.frete], ['12050.00', FRETE])
  assert.deepEqual(await itemDaMoto(a.motoId), [{ valor_unitario: '11900.00' }])
})

test('D4: aprovar reconfere moto + frete = pagamentos: pedido guardado adulterado é recusado e não vira venda', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await actions.solicitarAprovacaoVendaAction(venda(a, MINIMO - 100, [{ tipo: 'pix', valor: MINIMO - 100 + FRETE }]), 'Cliente fiel'), { ok: true, dados: undefined })
  const [ap] = await aprovacoesDaMoto(a.motoId)
  await execRows(sql`update aprovacoes_venda set dados_venda = jsonb_set(dados_venda, '{pagamentos}', '[{"tipo":"pix","valor":11900}]') where id = ${ap.id}`)
  usuario = a.socio
  assert.deepEqual(await actions.aprovarVendaAction(ap.id as string), { ok: false, erro: SOMA_PAGAMENTOS_DIFERE })
  assert.deepEqual(await vendaDaMoto(a.motoId), [])
  assert.deepEqual((await execRows(sql`select status from aprovacoes_venda where id = ${ap.id}`)).map(r => r.status), ['pendente'])
})

test('D5: frete com modalidade em que a loja não faz o frete é recusado e nada é gravado', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  const r = await actions.registrarVendaCompletaAction(venda(a, MINIMO, [{ tipo: 'pix', valor: MINIMO + FRETE }], { ...ENTREGAR, modalidade: 'ContratacaoPorContaDoDestinatario' }))
  assert.deepEqual(r, { ok: false, erro: 'O frete cobrado só vale com "Loja leva com veículo próprio" ou "Loja contrata e paga a transportadora".' })
  assert.deepEqual(await vendaDaMoto(a.motoId), [])
})

test('D7: Conta B não aprova o pedido com frete da Conta A: mesma frase de id inexistente, nada muda na A', async () => {
  const a = await semearConta()
  const b = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await actions.solicitarAprovacaoVendaAction(venda(a, MINIMO - 100, [{ tipo: 'pix', valor: MINIMO - 100 + FRETE }]), 'Cliente fiel'), { ok: true, dados: undefined })
  const [ap] = await aprovacoesDaMoto(a.motoId)
  usuario = b.socio
  assert.deepEqual(await actions.aprovarVendaAction(ap.id as string), { ok: false, erro: 'Solicitação não encontrada' })
  assert.deepEqual(await actions.aprovarVendaAction(randomUUID()), { ok: false, erro: 'Solicitação não encontrada' })
  assert.deepEqual(await vendaDaMoto(a.motoId), [])
  assert.deepEqual((await aprovacoesDaMoto(a.motoId)).map(r => [r.valor, r.frete]), [['11900.00', FRETE]])
})

test('D8: sem frete, a venda vale o que foi digitado, como antes', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  const r = await actions.registrarVendaCompletaAction(venda(a, MINIMO, [{ tipo: 'pix', valor: MINIMO }], { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' }))
  assert.equal(r.ok, true, JSON.stringify(r))
  assert.deepEqual((await vendaDaMoto(a.motoId)).map(v => v.valor), ['12000.00'])
})

test('D3b: a página da moto lê o pedido de aprovação com frete como moto + frete = total', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.deepEqual(await actions.solicitarAprovacaoVendaAction(venda(a, MINIMO - 100, [{ tipo: 'pix', valor: MINIMO - 100 + FRETE }]), 'Cliente fiel'), { ok: true, dados: undefined })
  usuario = a.socio
  const moto = await buscarMoto(a.socio, a.motoId)
  assert.ok(moto)
  const conta = contaDaAprovacao({ origem: moto.aprovacaoPendenteOrigem ?? 'moto', valor: moto.aprovacaoPendenteValor ?? '0', dadosVenda: moto.aprovacaoPendenteFreteGuardado })
  assert.deepEqual(conta, { moto: 11900, frete: FRETE, total: 12050 })
  // Vai ao navegador com a moto: só o que a conta usa, sem endereço nem quem recebe.
  assert.deepEqual(moto.aprovacaoPendenteFreteGuardado, { frete: null, entrega: { modo: 'entregar', frete: FRETE } })
})

test('D6: reserva finalizada pelo Vender com frete: restante = moto + frete - entrada; venda com o total e reserva convertida', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  const cliente = venda(a, MINIMO, [])
  const r = await actions.registrarReservaAction({
    ...cliente, valorReserva: '4000', valorTotalVenda: String(MINIMO), pagamentos: [{ tipo: 'pix', valor: 4000 }], dataPrevistaFinalizacao: '2026-12-01',
  })
  assert.equal(r.ok, true, JSON.stringify(r))
  const fim = await actions.registrarVendaCompletaAction(venda(a, MINIMO, [{ tipo: 'pix', valor: 4000 }, { tipo: 'pix', valor: MINIMO + FRETE - 4000 }]))
  assert.equal(fim.ok, true, JSON.stringify(fim))
  assert.deepEqual((await vendaDaMoto(a.motoId)).map(v => v.valor), ['12150.00'])
  assert.deepEqual(await execRows(sql`select status from reservas where moto_id = ${a.motoId}`), [{ status: 'convertida' }])
})

test('D1b: a NF lê a venda do Vender com moto 12.000 e frete 150, sem pendência da Entrega', async () => {
  const a = await semearConta()
  usuario = a.vendedor
  assert.equal((await actions.registrarVendaCompletaAction(venda(a, MINIMO, [{ tipo: 'pix', valor: MINIMO + FRETE }]))).ok, true)
  const nf = await vendaDoUsuarioParaNf(a.socio, eq(vendas.motoId, a.motoId))
  assert.ok(nf)
  const entrega = nf.entrega
  const valor = Number(nf.valor)
  assert.deepEqual([motoNaNota(valor, freteDaVenda(entrega)), freteDaVenda(entrega)], [12000, FRETE])
  assert.deepEqual(pendenciasDaEntrega(entrega, nf.clienteNome, valor), [])
})
