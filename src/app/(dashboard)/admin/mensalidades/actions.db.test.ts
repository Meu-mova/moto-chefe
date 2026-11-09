// Teste de banco: Postgres descartável. Tela de mensalidades do admin com a adesão (#804): a lista
// mostra a adesão pelo tipo, sem competência, com o grupo bloqueado; o "Conferir agora" dá baixa nela
// pela mesma regra do webhook (aprovado, valor, ambiente) e desbloqueia; só o admin_geral usa.
// Fronteira mockada: sessão, Mercado Pago e next/cache.
import { after, before, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearAdesao, semearContaBase, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'ADM804'
type Pagamento = { id: string; status: string; external_reference: string; transaction_amount: number; live_mode: boolean }
let usuarioDaSessao: Record<string, unknown> = { papel: 'admin_geral' }
let pagamentosNoMercadoPago: Pagamento[] = []
const mocks = [
  mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuarioDaSessao } }),
  mock.module('next/cache', { namedExports: { revalidatePath: () => {} } }),
  mock.module('@/lib/mercadopago/cliente', {
    namedExports: {
      buscarPagamentos: async (ref: string) => pagamentosNoMercadoPago.filter(p => p.external_reference === ref),
      consultarPagamento: async (id: string) => pagamentosNoMercadoPago.find(p => p.id === id),
      criarPreferencia: async () => { throw new Error('não usado') },
      expirarPreferencia: async () => {},
    },
  }),
]

type Db = typeof import('@/lib/db')
let db: Db['db']
type Actions = typeof import('./actions')
let listarMensalidadesAction: Actions['listarMensalidadesAction']
let conferirPagamentoAction: Actions['conferirPagamentoAction']
let situacaoMensalidade: typeof import('@/lib/mensalidade/bloqueio')['situacaoMensalidade']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

let cnpjSeq = 0
async function grupoComAdesaoAberta(nome: string): Promise<Base & { adesaoId: string }> {
  const g = await semearContaBase(db, { prefixo: P, nome, cnpj: `0000000085${String(++cnpjSeq).padStart(4, '0')}` })
  await semearAdesao(db, g, { versao: 2 })
  await db.execute(sql`update grupos set primeiro_acesso_em = '2026-11-09T15:00:00Z' where id = ${g.grupoId}`)
  const [a] = await linhas(sql`insert into mensalidades (grupo_id, tipo, competencia, valor, vencimento)
    values (${g.grupoId}, 'adesao', null, 399, '2026-11-09') returning id`)
  return { ...g, adesaoId: a.id }
}
const pagamento = (ref: string, o: Partial<Pagamento> = {}): Pagamento =>
  ({ id: `${P}-${ref}-${o.status ?? 'approved'}-${o.transaction_amount ?? 399}`, status: 'approved', external_reference: ref, transaction_amount: 399, live_mode: false, ...o })
const statusDa = async (id: string) => (await linhas(sql`select status from mensalidades where id = ${id}`))[0].status

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarMensalidadesAction, conferirPagamentoAction } = await import('./actions'))
  ;({ situacaoMensalidade } = await import('@/lib/mensalidade/bloqueio'))
})

beforeEach(() => { usuarioDaSessao = { papel: 'admin_geral' }; pagamentosNoMercadoPago = [] })

after(async () => {
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('a lista do admin mostra a adesão pelo tipo, sem competência, no valor da taxa, e o grupo bloqueado', async () => {
  const g = await grupoComAdesaoAberta('Lista')
  const linha = (await listarMensalidadesAction()).find(x => x.id === g.grupoId)
  assert.ok(linha)
  assert.deepEqual(linha.abertas.map(a => ({ id: a.id, tipo: a.tipo, competencia: a.competencia, total: a.total, temLink: a.temLink })),
    [{ id: g.adesaoId, tipo: 'adesao', competencia: null, total: 399, temLink: false }])
  assert.equal(linha.bloqueado, true)
})

test('"Conferir agora" acha o pagamento aprovado da adesão, dá baixa e o grupo deixa de estar bloqueado', async () => {
  const g = await grupoComAdesaoAberta('Paga')
  pagamentosNoMercadoPago = [pagamento(g.adesaoId)]
  assert.deepEqual(await conferirPagamentoAction(g.adesaoId), { ok: true, paga: true, motivo: 'Pagamento aprovado encontrado; baixa feita' })
  assert.equal(await statusDa(g.adesaoId), 'paga')
  assert.equal((await situacaoMensalidade(g.grupoId, [], new Date('2026-11-10T15:00:00Z'))).bloqueado, false)
})

test('"Conferir agora" com pagamento pendente ou menor que a taxa não dá baixa e diz por quê', async () => {
  const g = await grupoComAdesaoAberta('NaoPaga')
  pagamentosNoMercadoPago = [pagamento(g.adesaoId, { status: 'pending' }), pagamento(g.adesaoId, { transaction_amount: 300 })]
  const r = await conferirPagamentoAction(g.adesaoId)
  assert.equal(r.ok && r.paga, false)
  assert.match(r.ok ? r.motivo : '', /valor pago 300 menor que o devido 399/)
  assert.equal(await statusDa(g.adesaoId), 'aberta')
})

test('quem não é admin_geral não confere a adesão de nenhum grupo', async () => {
  const g = await grupoComAdesaoAberta('SoAdmin')
  pagamentosNoMercadoPago = [pagamento(g.adesaoId)]
  usuarioDaSessao = { papel: 'admin_socio' }
  await assert.rejects(conferirPagamentoAction(g.adesaoId), /Acesso restrito ao Admin Geral/)
  await assert.rejects(listarMensalidadesAction(), /Acesso restrito ao Admin Geral/)
  assert.equal(await statusDa(g.adesaoId), 'aberta')
})
