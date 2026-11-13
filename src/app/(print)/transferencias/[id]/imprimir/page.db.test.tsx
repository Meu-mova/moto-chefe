// Teste de banco da página do comprovante de transferência (#877), contra o Postgres descartável.
// Só a fronteira de fora é simulada: sessão, cookies e o redirect/notFound do Next. Grupo ativo,
// escopo de lojas e a consulta rodam de verdade.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearGrupo, semearUsuario, type Base } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url

type Sessao = { id: string; email: string; papel: string; lojaId: string | null; contaId: string | null; gruposAcesso: string[] }
let usuario: Sessao

class Desvio extends Error {
  constructor(readonly tipo: 'redirect' | 'notFound', readonly destino?: string) { super(tipo) }
}

const authMock = mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
const headersMock = mock.module('next/headers', { namedExports: { cookies: async () => ({ get: () => undefined }) } })
const navMock = mock.module('next/navigation', {
  namedExports: {
    redirect: (destino: string) => { throw new Desvio('redirect', destino) },
    notFound: () => { throw new Desvio('notFound') },
  },
})

type Db = typeof import('@/lib/db')
let db: Db['db']
let Pagina: typeof import('./page')['default']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ default: Pagina } = await import('./page'))
})
after(async () => {
  authMock.restore(); headersMock.restore(); navMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const PREFIXO = 'IMP877'
const idDe = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: { id: string }[] }).rows[0].id

// Conta A: grupo de origem e grupo de destino, uma transferência aceita entre eles. Conta B à parte.
async function cenario() {
  const suf = randomUUID()
  const origem = await semearContaBase(db, { prefixo: PREFIXO, nome: `${suf}-origem`, cnpj: suf.slice(0, 14) })
  const destino: Base = { ...origem, nome: `${suf}-destino`, ...(await semearGrupo(db, origem.contaId, { prefixo: PREFIXO, nome: `${suf}-destino`, cnpj: suf.slice(-14) })) }
  const contaB = await semearContaBase(db, { prefixo: PREFIXO, nome: `${suf}-b`, cnpj: suf.slice(4, 18) })
  const ana = await semearUsuario(db, origem, { papel: 'vendedor', rotulo: 'ana' })
  const modelo = await idDe(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-877', 'T877', 'autopropelido', '1000', '', '') returning id`)
  const chassi = `IMP877${suf.replace(/-/g, '').slice(0, 11).toUpperCase()}`
  const moto = await idDe(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${modelo}, ${destino.lojaId}, 'CINZA', '1', 'disponivel', 'disponivel') returning id`)
  const transferenciaId = await idDe(sql`insert into transferencias (moto_id, loja_origem_id, loja_destino_id, solicitado_por, status, data_resposta, respondido_por)
    values (${moto}, ${origem.lojaId}, ${destino.lojaId}, ${ana}, 'aceita', now(), ${ana}) returning id`)
  return { origem, destino, contaB, chassi, transferenciaId }
}

const sessao = (b: Base, papel: string): Sessao =>
  ({ id: randomUUID(), email: `${papel}@teste.invalid`, papel, lojaId: b.lojaId, contaId: b.contaId, gruposAcesso: [] })

async function abrir(id: string): Promise<string | Desvio> {
  try {
    return renderToStaticMarkup(createElement('div', null, await Pagina({ params: Promise.resolve({ id }) })))
  } catch (e) {
    if (e instanceof Desvio) return e
    throw e
  }
}

test('vendedor da origem e aux_adm do destino abrem o comprovante', async () => {
  const c = await cenario()
  usuario = sessao(c.origem, 'vendedor')
  const daOrigem = await abrir(c.transferenciaId)
  assert.ok(typeof daOrigem === 'string' && daOrigem.includes('COMPROVANTE DE TRANSFERÊNCIA') && daOrigem.includes(c.chassi))

  usuario = sessao(c.destino, 'aux_adm')
  const doDestino = await abrir(c.transferenciaId)
  assert.ok(typeof doDestino === 'string' && doDestino.includes(c.chassi))
})

test('Conta B com o id da Conta A recebe o mesmo "não encontrada" que um id inexistente ou malformado', async () => {
  const c = await cenario()
  usuario = sessao(c.contaB, 'aux_adm')
  const deOutraConta = await abrir(c.transferenciaId)
  const inexistente = await abrir(randomUUID())
  const malformado = await abrir('nao-e-uuid')
  for (const r of [deOutraConta, inexistente, malformado]) {
    assert.ok(r instanceof Desvio && r.tipo === 'notFound', `esperava notFound, veio ${r instanceof Desvio ? r.tipo : 'a página'}`)
  }
})

test('papel sem a tela de Transferências (mecânico) volta ao Dashboard', async () => {
  const c = await cenario()
  usuario = sessao(c.origem, 'mecanico')
  const r = await abrir(c.transferenciaId)
  assert.ok(r instanceof Desvio && r.tipo === 'redirect' && r.destino === '/dashboard')
})
