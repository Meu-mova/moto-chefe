// Teste de banco: a gravação do sync de PIX (#861) contra o Postgres descartável. Só o mcp.ai (a rede)
// é simulado; o upsert em pix_recebimentos_mcp roda de verdade.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url

type Pix = {
  contaId: string; banco: string; transacaoId: string; data: string; valor: string
  pagadorNome: string | null; descricao: string | null; tipoOperacao: string
}
let doMcpai: Pix[] = []
const mcpaiMock = mock.module('@/lib/mcpai', {
  namedExports: { buscarPixRecebidos: async () => ({ ok: true, transacoes: doMcpai, contasPuladas: [] }) },
})

let db: typeof import('@/lib/db')['db']
let sincronizarPix: typeof import('./pix-sync')['sincronizarPix']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ sincronizarPix } = await import('./pix-sync'))
})
after(async () => {
  mcpaiMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

async function linhas<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(q)) as unknown as { rows: T[] }).rows
}

async function grupoNovo() {
  const suf = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'PX861', nome: suf, cnpj: suf })
  return { id: base.grupoId, cnpj: suf }
}

const pix = (transacaoId: string, extra: Partial<Pix> = {}): Pix => ({
  contaId: 'conta-1', banco: 'Conta Corrente', transacaoId, data: '2026-11-11T03:00:00.000Z',
  valor: '10.00', pagadorNome: null, descricao: null, tipoOperacao: 'PIX', ...extra,
})

async function gravado(transacaoId: string) {
  const [l] = await linhas<{ grupo_id: string; banco: string; pagador_nome: string | null }>(
    sql`select grupo_id, banco, pagador_nome from pix_recebimentos_mcp where transacao_id = ${transacaoId}`,
  )
  return l
}

test('PIX já gravado com agência e conta no lugar do banco ganha o nome certo no próximo sync (#861)', async () => {
  const grupo = await grupoNovo()
  const id = randomUUID()
  doMcpai = [pix(id, { banco: 'Agência: 1 | Conta: 0000000-0' })]
  assert.equal((await sincronizarPix(grupo)).ok, true)
  assert.equal((await gravado(id)).banco, 'Agência: 1 | Conta: 0000000-0')

  doMcpai = [pix(id, { banco: 'Conta Corrente com Invest Fácil' })]
  assert.equal((await sincronizarPix(grupo)).ok, true)
  assert.equal((await gravado(id)).banco, 'Conta Corrente com Invest Fácil')
})

test('sync de outro grupo com o mesmo transacao_id não reescreve a linha do primeiro', async () => {
  const a = await grupoNovo()
  const b = await grupoNovo()
  const id = randomUUID()
  doMcpai = [pix(id, { banco: 'Banco A', pagadorNome: null })]
  await sincronizarPix(a)

  doMcpai = [pix(id, { banco: 'Banco B', pagadorNome: 'Pagador do grupo B' })]
  assert.equal((await sincronizarPix(b)).ok, true)

  const linha = await gravado(id)
  assert.equal(linha.grupo_id, a.id)
  assert.equal(linha.banco, 'Banco A')
  assert.equal(linha.pagador_nome, null)
})
