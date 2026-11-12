import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { buscarPagamentosAlterados, consultarConta } from './point'
import { ErroMercadoPago } from './cliente'

const TOKEN = 'TEST-tok-0000'
const original = globalThis.fetch
afterEach(() => { globalThis.fetch = original })

type Chamada = { url: URL; headers: Record<string, string> }
function mockFetch(respostas: Array<{ status?: number; body: unknown }>): Chamada[] {
  const chamadas: Chamada[] = []
  let i = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({ url: new URL(String(input)), headers: (init?.headers ?? {}) as Record<string, string> })
    const r = respostas[Math.min(i++, respostas.length - 1)]
    const status = r.status ?? 200
    return { ok: status >= 200 && status < 300, status, json: async () => r.body } as Response
  }) as typeof fetch
  return chamadas
}
const pagamentos = (n: number, ini = 0) => Array.from({ length: n }, (_, k) => ({ id: ini + k }))
const periodo = { inicio: new Date('2026-11-01T00:00:00.000Z'), fim: new Date('2026-11-02T00:00:00.000Z') }

test('pagina até o total', async () => {
  const chamadas = mockFetch([
    { body: { paging: { total: 137, limit: 100, offset: 0 }, results: pagamentos(100) } },
    { body: { paging: { total: 137, limit: 100, offset: 100 }, results: pagamentos(37, 100) } },
  ])
  const r = await buscarPagamentosAlterados(TOKEN, periodo)
  assert.equal(r.length, 137)
  assert.equal(chamadas.length, 2)
  assert.equal(chamadas[0].url.searchParams.get('offset'), '0')
  assert.equal(chamadas[1].url.searchParams.get('offset'), '100')
  assert.equal(chamadas[0].url.searchParams.get('range'), 'date_last_updated')
  assert.equal(chamadas[0].url.searchParams.get('sort'), 'date_last_updated')
  assert.equal(chamadas[0].url.searchParams.get('criteria'), 'asc')
  assert.equal(chamadas[0].url.searchParams.get('limit'), '100')
})

test('manda Bearer e as datas em ISO', async () => {
  const chamadas = mockFetch([{ body: { paging: { total: 0 }, results: [] } }])
  await buscarPagamentosAlterados(TOKEN, periodo)
  assert.equal(chamadas[0].headers.Authorization, `Bearer ${TOKEN}`)
  assert.equal(chamadas[0].url.searchParams.get('begin_date'), '2026-11-01T00:00:00.000Z')
  assert.equal(chamadas[0].url.searchParams.get('end_date'), '2026-11-02T00:00:00.000Z')
})

test('401 vira mensagem de credencial recusada sem o token', async () => {
  mockFetch([{ status: 401, body: { message: `invalid ${TOKEN}` } }])
  await assert.rejects(buscarPagamentosAlterados(TOKEN, periodo), (err: unknown) => {
    assert.ok(err instanceof ErroMercadoPago)
    assert.equal(err.status, 401)
    assert.equal(err.message, 'Credencial do Mercado Pago recusada (HTTP 401). Cadastre o token novo em Admin › Grupos.')
    assert.ok(!err.message.includes(TOKEN))
    return true
  })
})

test('consultarConta devolve id como string', async () => {
  const chamadas = mockFetch([{ body: { id: 123456, nickname: 'LOJA BH', email: 'x@y.z' } }])
  assert.deepEqual(await consultarConta(TOKEN), { id: '123456', nickname: 'LOJA BH' })
  assert.equal(chamadas[0].url.pathname, '/users/me')
})
