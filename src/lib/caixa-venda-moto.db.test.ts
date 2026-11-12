// Teste de banco: Postgres descartável. Dinheiro da venda de moto no caixa (#775) pelo Vender e pelo
// Editar venda: um lançamento por pagamento em dinheiro, na loja e no dia de Brasília da venda.
// Fronteira de fora mockada por mockarFronteiraDasVendas (src/test/fronteira-vendas.ts).
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'
import { mockarFronteiraDasVendas } from '@/test/fronteira-vendas'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url

const P = 'CXM775'
let usuarioDaSessao: Record<string, unknown> = {}
const restaurarMocks = mockarFronteiraDasVendas(() => usuarioDaSessao)

type Db = typeof import('@/lib/db')
let db: Db['db']
let execRows: Db['execRows']
let vendas: typeof import('@/app/(dashboard)/vendas/actions')
let conta: { lojaId: string; modeloId: string; origemId: string }

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  vendas = await import('@/app/(dashboard)/vendas/actions')
  const base = await semearContaBase(db, { prefixo: P, nome: randomUUID(), cnpj: randomUUID() })
  const socioId = await semearUsuario(db, base, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  const [modelo] = await execRows(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${P + randomUUID()}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [origem] = await execRows(sql`insert into origens_venda (grupo_id, nome) values (${base.grupoId}, ${'Loja ' + P}) returning id`)
  conta = { lojaId: base.lojaId, modeloId: modelo.id as string, origemId: origem.id as string }
  usuarioDaSessao = { id: socioId, papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId, grupoLiberado: null }
})
after(async () => {
  restaurarMocks()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

async function novaMoto() {
  const [m] = await execRows(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${P + randomUUID()}, ${conta.modeloId}, ${conta.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  return m.id as string
}

const vender = (motoId: string, pagamentos: { tipo: string; valor: number }[]) => vendas.registrarVendaCompletaAction({
  motoId, clienteNome: 'Cliente ' + P, clienteCpf: '52998224725', clienteCelular: '35999990775', clienteEmail: 'c@example.com',
  clienteCep: '', clienteLogradouro: '', clienteNumero: '', clienteComplemento: '', clienteBairro: '', clienteCidade: '', clienteEstado: '',
  valorTotal: '12000', pagamentos, origemId: conta.origemId,
})

const caixaDaMoto = (motoId: string) => execRows(sql`select l.loja_id, l.descricao, l.valor, l.data::text as data, l.venda_id = v.id as da_venda
  from lancamentos_caixa l join vendas v on v.id = l.venda_id where v.moto_id = ${motoId} order by l.valor`)
const diaEmBrasilia = (d: Date) => d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

test('Vender com dinheiro + PIX: só o dinheiro entra no caixa, na loja e no dia de hoje em Brasília', async () => {
  const moto = await novaMoto()
  assert.equal((await vender(moto, [{ tipo: 'dinheiro', valor: 4000 }, { tipo: 'pix', valor: 8000 }])).ok, true)
  assert.deepEqual(await caixaDaMoto(moto), [
    { loja_id: conta.lojaId, descricao: 'Venda dinheiro — Cliente ' + P, valor: '4000.00', data: diaEmBrasilia(new Date()), da_venda: true },
  ])
})

test('Vender às 22h30 de Brasília: o dinheiro fica no caixa do mesmo dia, não no dia seguinte (UTC)', async () => {
  const moto = await novaMoto()
  // 01:30 UTC do dia 12 = 22:30 do dia 11 em Brasília.
  mock.timers.enable({ apis: ['Date'], now: new Date('2026-11-12T01:30:00.000Z') })
  try {
    assert.equal((await vender(moto, [{ tipo: 'dinheiro', valor: 12000 }])).ok, true)
  } finally {
    mock.timers.reset()
  }
  assert.deepEqual((await caixaDaMoto(moto)).map(l => l.data), ['2026-11-11'])
})

test('Editar venda trocando as formas: apaga o dinheiro antigo e lança só o novo, no dia da venda', async () => {
  const moto = await novaMoto()
  assert.equal((await vender(moto, [{ tipo: 'dinheiro', valor: 12000 }])).ok, true)
  const [{ id }] = await execRows(sql`select id from vendas where moto_id = ${moto}`)
  assert.deepEqual(await vendas.editarVendaAction(id as string, {
    valor: '12000', dataVenda: '2026-11-07', pagamentos: [{ tipo: 'dinheiro', valor: 5000 }, { tipo: 'pix', valor: 7000 }],
    clienteNome: 'Cliente ' + P, clienteCpf: '52998224725',
  }), { ok: true, dados: undefined })
  assert.deepEqual(await caixaDaMoto(moto), [
    { loja_id: conta.lojaId, descricao: 'Venda dinheiro (editado) — Cliente ' + P, valor: '5000.00', data: '2026-11-07', da_venda: true },
  ])
})
