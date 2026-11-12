// Teste de banco: Postgres descartável. Cobrança da adesão no 1º acesso (#803): só o grupo com
// contrato assinado na versão 2 ganha a cobrança, uma só, no valor da taxa da ficha; ela bloqueia
// o grupo na hora e a baixa libera. Regime antigo, taxa zero/vazia e grupo isento não cobram.
// Fronteira mockada: cookie do grupo ativo (next/headers), sessão, Mercado Pago e e-mail; o resto é banco.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearGrupo, semearUsuario, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'ADE803'
let grupoDoCookie: string | undefined
let usuarioDaSessao: Record<string, unknown> = {}
const mocks = [
  mock.module('next/headers', { namedExports: { cookies: async () => ({ get: (nome: string) => (nome === 'grupoAtivo' && grupoDoCookie ? { value: grupoDoCookie } : undefined) }) } }),
  mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuarioDaSessao } }),
  mock.module('@/lib/mercadopago/cliente', {
    namedExports: {
      criarPreferencia: async (p: { mensalidadeId: string }) => ({ id: `pref-${p.mensalidadeId}`, init_point: `https://mp.teste/${p.mensalidadeId}` }),
      expirarPreferencia: async () => {},
    },
  }),
  mock.module('@/lib/email', { namedExports: { enviarEmail: async () => ({ status: 'enviado', id: 'x' }) } }),
]
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
async function grupoComAdesao(
  nome: string, o: { versao?: 1 | 2; status?: string; taxa?: string | null; isento?: boolean; taxaConfig?: string; contaId?: string } = {},
): Promise<Base> {
  const cnpj = `0000000080${String(++cnpjSeq).padStart(4, '0')}`
  const g = o.contaId
    ? { prefixo: P, nome, contaId: o.contaId, ...(await semearGrupo(db, o.contaId, { prefixo: P, nome, cnpj })) }
    : await semearContaBase(db, { prefixo: P, nome, cnpj })
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
  for (const m of mocks) m.restore()
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

test('sócio com dois grupos da mesma Conta: a faixa mostra a adesão em aberto do outro grupo como bloqueado', async () => {
  // O isolamento entre Contas é da leitura dos grupos do usuário, provado no "Pagar" (link-pagamento.db.test.ts).
  const matriz = await grupoComAdesao('Matriz', { versao: 2, taxa: '0' })
  const filial = await grupoComAdesao('Filial', { versao: 2, contaId: matriz.contaId })
  await registrarPrimeiroAcesso(matriz.grupoId, ACESSO)
  await registrarPrimeiroAcesso(filial.grupoId, ACESSO)
  const s = await situacaoMensalidade(matriz.grupoId, [matriz.grupoId, filial.grupoId], ACESSO)
  assert.deepEqual({ bloqueado: s.bloqueado, aberta: s.aberta, outros: s.outros },
    { bloqueado: false, aberta: null, outros: [{ nome: `${P} Filial`, bloqueado: true }] })
})

test('admin_rede na persona do grupo liberado B cria a adesão de B, continua com B e paga; fora da persona não mexe nem acha a adesão', async () => {
  // Decisão do Luis (09/11/2026, opção B): a persona conta como 1º acesso, e a adesão em aberto não tira
  // B das liberações vivas: o admin_rede cai na /mensalidade de B e pode pagar (como na #773).
  const { gruposLiberadosVivos, usuarioDaRede } = await import('@/lib/grupos-liberados')
  const { grupoAtivoDaRequisicao } = await import('@/lib/grupo')
  const { registrarSePrimeiroAcesso } = await import('@/lib/primeiro-acesso')
  const { linkPagamentoAction } = await import('@/app/mensalidade/actions')
  const { MENSALIDADE_NAO_ENCONTRADA } = await import('@/lib/mensalidade/regras')
  const a = await grupoComAdesao('RedeA', { taxa: '0' })
  const b = await grupoComAdesao('RedeB', { versao: 2 })
  const id = await semearUsuario(db, a, { papel: 'admin_rede', rotulo: 'rede', semLoja: true, comGrupo: true, comConta: true })
  await db.execute(sql`insert into grupos_liberados (usuario_id, grupo_id, liberado_por) values (${id}, ${b.grupoId}, ${id})`)
  const base = { id, email: 'rede@teste.invalid', papel: 'admin_rede', lojaId: null, gruposAcesso: [a.grupoId], gruposAprovacao: [], contaId: a.contaId }
  // Como em auth.ts: liberações vivas do banco e a persona é o grupo do cookie.
  const entrar = async (grupoNoCookie: string) => {
    grupoDoCookie = grupoNoCookie
    usuarioDaSessao = usuarioDaRede(base, await gruposLiberadosVivos(id, ACESSO), grupoNoCookie)
    const u = usuarioDaSessao as ReturnType<typeof usuarioDaRede<typeof base>>
    const grupo = await grupoAtivoDaRequisicao(u)
    await registrarSePrimeiroAcesso(u.papel, grupo, ACESSO)
    return grupo
  }

  assert.equal((await entrar(a.grupoId)).id, a.grupoId)
  assert.equal(await primeiroAcessoDo(b.grupoId), null)
  assert.deepEqual(await adesoesDo(b.grupoId), [])

  assert.equal((await entrar(b.grupoId)).id, b.grupoId)
  const [adesao] = await adesoesDo(b.grupoId)
  assert.equal(adesao.valor, '399.00')
  assert.equal((await primeiroAcessoDo(b.grupoId))?.toISOString(), ACESSO.toISOString())

  // Próxima página: B continua liberado, a persona continua em B e o Pagar acha a adesão.
  assert.deepEqual((await gruposLiberadosVivos(id, ACESSO)).map(l => l.grupoId), [b.grupoId])
  assert.equal((await entrar(b.grupoId)).id, b.grupoId)
  assert.equal((await situacaoMensalidade(b.grupoId, [], ACESSO)).bloqueado, true)
  assert.deepEqual(await linkPagamentoAction(adesao.id), { ok: true, url: `https://mp.teste/${adesao.id}` })

  // Fora da persona: a mesma adesão não é achada.
  await entrar(a.grupoId)
  assert.deepEqual(await linkPagamentoAction(adesao.id), { ok: false, erro: MENSALIDADE_NAO_ENCONTRADA })
})
