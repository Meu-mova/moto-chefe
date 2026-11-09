// Teste de banco: Postgres descartável. Cobrança da adesão no 1º acesso (#803): só o grupo com
// contrato assinado na versão 2 ganha a cobrança, uma só, no valor da taxa da ficha; ela bloqueia
// o grupo na hora e a baixa libera. Regime antigo, taxa zero/vazia e grupo isento não cobram.
// Sem mock: tudo aqui é banco.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'ADE803'
type Db = typeof import('@/lib/db')
let db: Db['db']
let registrarPrimeiroAcesso: typeof import('@/lib/primeiro-acesso')['registrarPrimeiroAcesso']
let situacaoMensalidade: typeof import('@/lib/mensalidade/bloqueio')['situacaoMensalidade']
let aplicarBaixa: typeof import('@/lib/mensalidade/baixa')['aplicarBaixa']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

// 09/11/2026 às 22h em Brasília: já é dia 10 no UTC.
const ACESSO = new Date('2026-11-10T01:00:00Z')

let cnpjSeq = 0
async function grupoComAdesao(nome: string, o: { versao?: 1 | 2; status?: string; taxa?: string | null; isento?: boolean; taxaConfig?: string } = {}): Promise<Base> {
  const g = await semearContaBase(db, { prefixo: P, nome, cnpj: `0000000080${String(++cnpjSeq).padStart(4, '0')}` })
  const [a] = await linhas(sql`insert into adesoes_mova (loja, responsavel, celular, cnpj_arquivo_path, store_login, usuarios, grupo_id, taxa_implantacao, valor_mensal, email)
    values (${g.nome}, 'Resp', '35999999999', 'x', 'login', '[]'::jsonb, ${g.grupoId}, ${o.taxa === undefined ? '399.00' : o.taxa}, 499, 'resp@teste.invalid') returning id`)
  if (o.versao) {
    await db.execute(sql`insert into contratos_adesao (adesao_id, token, status, html_snapshot, snapshot_hash, email_destino, expira_em, versao_cobranca)
      values (${a.id}, ${`${P}-${nome}-${randomUUID()}`}, ${o.status ?? 'assinado'}, '<p>c</p>', 'h', 'resp@teste.invalid', now() + interval '7 days', ${o.versao})`)
  }
  if (o.isento || o.taxaConfig) {
    await db.execute(sql`insert into mensalidade_config (grupo_id, isento, taxa_implantacao) values (${g.grupoId}, ${o.isento ?? false}, ${o.taxaConfig ?? null})`)
  }
  return g
}

const adesoesDo = (grupoId: string) => linhas(sql`
  select id, valor::text, vencimento::text, competencia, status from mensalidades where grupo_id = ${grupoId} and tipo = 'adesao'`)
const primeiroAcessoDo = async (grupoId: string) => {
  const v = (await linhas(sql`select primeiro_acesso_em from grupos where id = ${grupoId}`))[0].primeiro_acesso_em as string | null
  return v === null ? null : new Date(v)
}

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ registrarPrimeiroAcesso } = await import('@/lib/primeiro-acesso'))
  ;({ situacaoMensalidade } = await import('@/lib/mensalidade/bloqueio'))
  ;({ aplicarBaixa } = await import('@/lib/mensalidade/baixa'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('contrato assinado na versão 2: o 1º acesso grava uma adesão com a taxa da ficha, vencendo no dia de Brasília', async () => {
  const g = await grupoComAdesao('V2', { versao: 2 })
  await registrarPrimeiroAcesso(g.grupoId, ACESSO)
  assert.deepEqual((await adesoesDo(g.grupoId)).map(({ valor, vencimento, competencia, status }) => ({ valor, vencimento, competencia, status })),
    [{ valor: '399.00', vencimento: '2026-11-09', competencia: null, status: 'aberta' }])
  assert.equal((await primeiroAcessoDo(g.grupoId))?.toISOString(), ACESSO.toISOString())
})

test('acessos repetidos e simultâneos: uma adesão só, e a data do 1º acesso não muda', async () => {
  const g = await grupoComAdesao('Simultaneo', { versao: 2 })
  await Promise.all([registrarPrimeiroAcesso(g.grupoId, ACESSO), registrarPrimeiroAcesso(g.grupoId, ACESSO)])
  await registrarPrimeiroAcesso(g.grupoId, new Date('2026-12-01T12:00:00Z'))
  assert.equal((await adesoesDo(g.grupoId)).length, 1)
  assert.equal((await primeiroAcessoDo(g.grupoId))?.toISOString(), ACESSO.toISOString())
})

test('a taxa da configuração de mensalidade não vale para a adesão: vale a da ficha', async () => {
  const g = await grupoComAdesao('Config', { versao: 2, taxaConfig: '999.00' })
  await registrarPrimeiroAcesso(g.grupoId, ACESSO)
  assert.deepEqual((await adesoesDo(g.grupoId)).map(a => a.valor), ['399.00'])
})

test('sem cobrança e sem bloqueio: taxa zero, taxa vazia ou grupo isento', async () => {
  for (const [nome, o] of [['Zero', { taxa: '0' }], ['Vazia', { taxa: null }], ['Isento', { isento: true }]] as const) {
    const g = await grupoComAdesao(nome, { versao: 2, ...o })
    await registrarPrimeiroAcesso(g.grupoId, ACESSO)
    assert.deepEqual(await adesoesDo(g.grupoId), [], nome)
    assert.equal((await situacaoMensalidade(g.grupoId, [], ACESSO)).bloqueado, false, nome)
    assert.notEqual(await primeiroAcessoDo(g.grupoId), null, nome)
  }
})

test('regime antigo: sem contrato, contrato v1 assinado ou v2 só enviado não cobram adesão', async () => {
  for (const [nome, o] of [['SemContrato', {}], ['V1', { versao: 1 }], ['V2Pendente', { versao: 2, status: 'pendente' }]] as const) {
    const g = await grupoComAdesao(nome, o)
    await registrarPrimeiroAcesso(g.grupoId, ACESSO)
    assert.deepEqual(await adesoesDo(g.grupoId), [], nome)
  }
})

test('adesão em aberto bloqueia o grupo na hora; o pagamento aprovado libera; notificação repetida não baixa de novo', async () => {
  const g = await grupoComAdesao('Bloqueio', { versao: 2 })
  await registrarPrimeiroAcesso(g.grupoId, ACESSO)
  assert.equal((await situacaoMensalidade(g.grupoId, [], ACESSO)).bloqueado, true)

  const { mensalidades } = await import('@/lib/db/schema')
  const { and, eq } = await import('drizzle-orm')
  const [adesao] = await db.select().from(mensalidades).where(and(eq(mensalidades.grupoId, g.grupoId), eq(mensalidades.tipo, 'adesao')))
  const pg = { id: `${P}-1`, status: 'approved', external_reference: adesao.id, transaction_amount: 399, live_mode: false }
  assert.equal((await aplicarBaixa({ ...pg, status: 'pending' }, adesao, false)).acao, 'ignorar')
  assert.equal((await aplicarBaixa({ ...pg, transaction_amount: 300 }, adesao, false)).acao, 'erro')
  assert.equal((await aplicarBaixa({ ...pg, live_mode: true }, adesao, false)).acao, 'erro')
  assert.equal((await situacaoMensalidade(g.grupoId, [], ACESSO)).bloqueado, true)

  assert.equal((await aplicarBaixa(pg, adesao, false)).acao, 'pagar')
  assert.equal((await aplicarBaixa(pg, adesao, false)).acao, 'ignorar')
  assert.deepEqual((await adesoesDo(g.grupoId)).map(a => a.status), ['paga'])
  assert.equal((await situacaoMensalidade(g.grupoId, [], ACESSO)).bloqueado, false)
})

test('Conta B não vê a adesão da Conta A; o sócio vê a adesão em aberto de outro grupo dele', async () => {
  const a = await grupoComAdesao('ContaA', { versao: 2 })
  const b = await grupoComAdesao('ContaB', { versao: 2, taxa: '0' })
  await registrarPrimeiroAcesso(a.grupoId, ACESSO)
  await registrarPrimeiroAcesso(b.grupoId, ACESSO)
  const deB = await situacaoMensalidade(b.grupoId, [b.grupoId], ACESSO)
  assert.deepEqual({ bloqueado: deB.bloqueado, aberta: deB.aberta, outros: deB.outros }, { bloqueado: false, aberta: null, outros: [] })
  // Grupo ativo sem nada, outro grupo visível com a adesão em aberto: a faixa mostra bloqueado.
  const comA = await situacaoMensalidade(b.grupoId, [b.grupoId, a.grupoId], ACESSO)
  assert.deepEqual(comA.outros.map(o => o.bloqueado), [true])
})
