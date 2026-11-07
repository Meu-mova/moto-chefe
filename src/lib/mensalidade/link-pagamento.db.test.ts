// Teste de banco: Postgres descartável. "Pagar" da /mensalidade (#773): o sócio só pede link da
// mensalidade de um grupo que a tela lista para ele. Mensalidade de outra Conta, id inexistente e
// id que nem é UUID recebem a mesma frase e nada é gravado.
// Fronteira de fora mockada: sessão, cookie do grupo ativo e Mercado Pago.
import { after, before, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'MEN773'
let usuarioDaSessao: Record<string, unknown> = {}
let preferenciasCriadas: string[] = []
let grupoDoCookie: string | undefined
const mocks = [
  mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuarioDaSessao } }),
  mock.module('next/headers', { namedExports: { cookies: async () => ({ get: (nome: string) => (nome === 'grupoAtivo' && grupoDoCookie ? { value: grupoDoCookie } : undefined) }) } }),
  mock.module('@/lib/mercadopago/cliente', {
    namedExports: {
      criarPreferencia: async (p: { mensalidadeId: string }) => {
        preferenciasCriadas = [...preferenciasCriadas, p.mensalidadeId]
        return { id: `pref-${P}`, init_point: `https://mp.teste/${P}` }
      },
      expirarPreferencia: async () => {},
    },
  }),
]

type Db = typeof import('@/lib/db')
let db: Db['db']
let linkPagamentoAction: typeof import('@/app/mensalidade/actions')['linkPagamentoAction']
let MENSALIDADE_NAO_ENCONTRADA: string
let usuarioDaRede: typeof import('@/lib/grupos-liberados')['usuarioDaRede']
let socioA: Record<string, unknown> = {}
const semente = { a: null as Base | null, b: null as Base | null, mensalidadeA: '', mensalidadeB: '' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

const abrirMensalidade = async (grupoId: string) => (await linhas(sql`insert into mensalidades (grupo_id, competencia, valor, vencimento)
  values (${grupoId}, '2099-01', 499, '2099-01-10') returning id`))[0].id as string

const gravadoNa = async (id: string) => (await linhas(sql`
  select link_pagamento, mp_preference_id, acrescimo::text from mensalidades where id = ${id}`))[0]

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ linkPagamentoAction } = await import('@/app/mensalidade/actions'))
  ;({ MENSALIDADE_NAO_ENCONTRADA } = await import('@/lib/mensalidade/regras'))
  ;({ usuarioDaRede } = await import('@/lib/grupos-liberados'))
  const a = await semearContaBase(db, { prefixo: P, nome: 'A', cnpj: '00000000077301' })
  const b = await semearContaBase(db, { prefixo: P, nome: 'B', cnpj: '00000000077302' })
  const socioId = await semearUsuario(db, a, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  Object.assign(semente, { a, b, mensalidadeA: await abrirMensalidade(a.grupoId), mensalidadeB: await abrirMensalidade(b.grupoId) })
  socioA = {
    id: socioId, email: `socio-${P}@teste`, papel: 'admin_socio', lojaId: null,
    gruposAcesso: [a.grupoId], contaId: a.contaId, gruposLiberados: [],
  }
})

beforeEach(() => { preferenciasCriadas = []; usuarioDaSessao = socioA; grupoDoCookie = undefined })

after(async () => {
  const grupoIds = [semente.a?.grupoId, semente.b?.grupoId].filter((id): id is string => !!id)
  const contaIds = [semente.a?.contaId, semente.b?.contaId].filter((id): id is string => !!id)
  for (const g of grupoIds) {
    await db.execute(sql`delete from mensalidades where grupo_id = ${g}`)
    await db.execute(sql`delete from lojas where grupo_id = ${g}`)
  }
  await db.execute(sql`delete from usuarios where email like ${'%-' + P.toLowerCase() + '-%'}`)
  for (const g of grupoIds) await db.execute(sql`delete from grupos where id = ${g}`)
  for (const c of contaIds) await db.execute(sql`delete from contas where id = ${c}`)
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('sócio da Conta A pedindo o link da mensalidade da Conta B recebe a frase de não encontrada e nada é gravado', async () => {
  assert.deepEqual(await linkPagamentoAction(semente.mensalidadeB), { ok: false, erro: MENSALIDADE_NAO_ENCONTRADA })
  assert.deepEqual(preferenciasCriadas, [])
  assert.deepEqual(await gravadoNa(semente.mensalidadeB), { link_pagamento: null, mp_preference_id: null, acrescimo: '0.00' })
})

test('id inexistente recebe a mesma resposta da mensalidade de outra Conta', async () => {
  assert.deepEqual(await linkPagamentoAction('00000000-0000-4000-8000-0000000c0773'), await linkPagamentoAction(semente.mensalidadeB))
  assert.deepEqual(preferenciasCriadas, [])
})

test('id que não é UUID recebe a mesma frase, sem erro do banco', async () => {
  assert.deepEqual(await linkPagamentoAction('nao-e-uuid'), { ok: false, erro: MENSALIDADE_NAO_ENCONTRADA })
  assert.deepEqual(preferenciasCriadas, [])
})

test('sócio da Conta A paga a própria mensalidade: recebe o link e ele fica gravado', async () => {
  assert.deepEqual(await linkPagamentoAction(semente.mensalidadeA), { ok: true, url: `https://mp.teste/${P}` })
  assert.deepEqual(preferenciasCriadas, [semente.mensalidadeA])
  assert.deepEqual(await gravadoNa(semente.mensalidadeA), { link_pagamento: `https://mp.teste/${P}`, mp_preference_id: `pref-${P}`, acrescimo: '0.00' })
})

test('admin_rede da Conta A com o grupo da Conta B liberado não paga a mensalidade da Conta B (a tela não a lista)', async () => {
  const { a, b } = semente
  assert.ok(a && b)
  usuarioDaSessao = usuarioDaRede(
    { ...socioA, papel: 'admin_rede', lojaId: null, gruposAcesso: [a.grupoId], gruposAprovacao: [], contaId: a.contaId },
    [{ grupoId: b.grupoId, contaId: b.contaId }],
    null,
  )
  assert.deepEqual(await linkPagamentoAction(semente.mensalidadeB), { ok: false, erro: MENSALIDADE_NAO_ENCONTRADA })
  assert.deepEqual(preferenciasCriadas, [])
})

test('admin_geral com a Conta A ativa não paga a mensalidade da Conta B; a do grupo ativo sim', async () => {
  const { a } = semente
  assert.ok(a)
  usuarioDaSessao = { ...socioA, papel: 'admin_geral', gruposAcesso: [] }
  grupoDoCookie = a.grupoId
  assert.deepEqual(await linkPagamentoAction(semente.mensalidadeB), { ok: false, erro: MENSALIDADE_NAO_ENCONTRADA })
  assert.deepEqual(preferenciasCriadas, [])
  assert.equal((await linkPagamentoAction(semente.mensalidadeA)).ok, true)
})

test('erro do banco ao ler os grupos não vira "não encontrada": responde que o link não saiu agora', async () => {
  // loja_id que não é UUID faz o Postgres recusar a leitura do grupo da própria loja.
  usuarioDaSessao = { ...socioA, lojaId: 'nao-e-uuid' }
  assert.deepEqual(await linkPagamentoAction(semente.mensalidadeA), { ok: false, erro: 'Não deu para gerar o link agora. Tente de novo em alguns minutos.' })
  assert.deepEqual(preferenciasCriadas, [])
})
