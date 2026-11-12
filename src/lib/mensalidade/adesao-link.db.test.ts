// Teste de banco: Postgres descartável. Link e e-mail da adesão logo depois do 1º acesso (#803).
// O link é pedido fora da transação do 1º acesso: se o Mercado Pago falhar, a cobrança continua
// gravada, aberta e sem link, para o "Tentar de novo" e o cron. Fronteira mockada: Mercado Pago e e-mail.
import { after, before, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearAdesao, semearContaBase } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'ADL803'
type Preferencia = { mensalidadeId: string; tipo: string; titulo: string; valor: number }
let preferencias: Preferencia[] = []
let mpFora = false
// Corrida: segura as respostas do Mercado Pago até chegarem `segurarAte` pedidos, e cada uma devolve um link diferente.
let segurarAte = 0
let segurados: (() => void)[] = []
let chamadas = 0
let emails: { para: string; assunto: string }[] = []
const mocks = [
  mock.module('@/lib/mercadopago/cliente', {
    namedExports: {
      criarPreferencia: async (p: Preferencia) => {
        if (mpFora) throw new Error('Mercado Pago respondeu 503 em /checkout/preferences')
        preferencias = [...preferencias, p]
        if (segurarAte === 0) return { id: `pref-${p.mensalidadeId}`, init_point: `https://mp.teste/${p.mensalidadeId}` }
        const n = ++chamadas
        await new Promise<void>(ok => {
          segurados = [...segurados, ok]
          if (segurados.length === segurarAte) segurados.forEach(f => f())
        })
        return { id: `pref-${p.mensalidadeId}-${n}`, init_point: `https://mp.teste/${p.mensalidadeId}/${n}` }
      },
      expirarPreferencia: async () => {},
    },
  }),
  mock.module('@/lib/email', {
    namedExports: {
      enviarEmail: async (e: { para: string; assunto: string }) => {
        emails = [...emails, { para: e.para, assunto: e.assunto }]
        return { status: 'enviado', id: 'x' }
      },
    },
  }),
]

type Db = typeof import('@/lib/db')
let db: Db['db']
let cobrarAdesao: typeof import('@/lib/mensalidade/link')['cobrarAdesao']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

let cnpjSeq = 0
// Adesão aberta e sem link, como o 1º acesso a deixa, mas sem gravar o 1º acesso: assim o cron
// global de cobranca-cron.db.test.ts, que roda em paralelo, não pega esta adesão (#804).
async function adesaoAberta(nome: string): Promise<string> {
  const g = await semearContaBase(db, { prefixo: P, nome, cnpj: `0000000081${String(++cnpjSeq).padStart(4, '0')}` })
  await semearAdesao(db, g, { email: `resp-${nome}@teste.invalid`, versao: 2 })
  const [a] = await linhas(sql`insert into mensalidades (grupo_id, tipo, competencia, valor, taxa_implantacao, vencimento)
    values (${g.grupoId}, 'adesao', null, 399, 399, '2026-11-09') returning id`)
  return a.id
}

const gravada = async (id: string) => (await linhas(sql`
  select status, link_pagamento, mp_preference_id from mensalidades where id = ${id}`))[0]

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ cobrarAdesao } = await import('@/lib/mensalidade/link'))
})

beforeEach(() => { preferencias = []; emails = []; mpFora = false; segurarAte = 0; segurados = []; chamadas = 0 })

after(async () => {
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('gera o link da adesão no valor da taxa e manda o e-mail de adesão para o e-mail da ficha', async () => {
  const id = await adesaoAberta('Ok')
  assert.deepEqual(await cobrarAdesao(id), { url: `https://mp.teste/${id}`, falha: null })
  assert.deepEqual(preferencias.map(p => ({ id: p.mensalidadeId, tipo: p.tipo, valor: p.valor })), [{ id, tipo: 'adesao', valor: 399 }])
  assert.deepEqual(await gravada(id), { status: 'aberta', link_pagamento: `https://mp.teste/${id}`, mp_preference_id: `pref-${id}` })
  assert.deepEqual(emails, [{ para: 'resp-Ok@teste.invalid', assunto: 'Adesão ao MOVA: R$ 399,00' }])
})

test('Mercado Pago fora: a adesão continua gravada, aberta e sem link, e nenhum e-mail sai', async () => {
  const id = await adesaoAberta('MpFora')
  mpFora = true
  const r = await cobrarAdesao(id)
  assert.deepEqual(r, { url: null, falha: 'Mercado Pago respondeu 503 em /checkout/preferences' })
  assert.deepEqual(await gravada(id), { status: 'aberta', link_pagamento: null, mp_preference_id: null })
  assert.deepEqual(emails, [])
})

test('adesão que já tem link devolve esse link, sem pedir outro nem reenviar o e-mail', async () => {
  const id = await adesaoAberta('JaTem')
  await cobrarAdesao(id)
  preferencias = []; emails = []
  assert.deepEqual(await cobrarAdesao(id), { url: `https://mp.teste/${id}`, falha: null })
  assert.deepEqual([preferencias, emails], [[], []])
})

test('dois pedidos que leem a adesão sem link ao mesmo tempo: um grava, os dois recebem o link gravado, um e-mail só', async () => {
  const id = await adesaoAberta('Corrida')
  segurarAte = 2
  const [r1, r2] = await Promise.all([cobrarAdesao(id), cobrarAdesao(id)])
  const gravado = (await gravada(id)).link_pagamento
  assert.equal(preferencias.length, 2)
  assert.deepEqual([r1.url, r2.url], [gravado, gravado])
  assert.equal(emails.length, 1)
})
