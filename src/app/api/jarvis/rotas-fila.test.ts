import { test, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { EsperaEsgotada } from '@/lib/limitar-concorrencia'

// A fila do Jarvis (conexao.ts) é trocada por uma que responde como se estivesse cheia: aqui se prova
// o caminho do erro até a resposta das rotas; a fila de verdade é testada em limitar-concorrencia.test.ts.
const TOKEN = 'token-de-teste'
before(() => { process.env.JARVIS_API_TOKEN = TOKEN })
after(() => { delete process.env.JARVIS_API_TOKEN })
const conexaoMock = mock.module('@/lib/jarvis/conexao', {
  namedExports: { comClientJarvis: async () => { throw new EsperaEsgotada(10_000) } },
})
after(() => conexaoMock.restore())

const FILA_CHEIA = { erro: 'consulta demorou demais', detalhe: 'muitas consultas ao mesmo tempo' }
const pedido = (caminho: string, init: { method?: string; body?: string } = {}) =>
  new NextRequest(`http://localhost${caminho}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' } })

test('consulta com a fila cheia responde 408 dizendo que há consultas demais', async () => {
  const { POST } = await import('./consulta/route')
  const res = await POST(pedido('/api/jarvis/consulta', { method: 'POST', body: JSON.stringify({ sql: 'select 1' }) }))
  assert.equal(res.status, 408)
  assert.deepEqual(await res.json(), FILA_CHEIA)
})

test('schema com a fila cheia responde igual à consulta', async () => {
  const { GET } = await import('./schema/route')
  const res = await GET(pedido('/api/jarvis/schema'))
  assert.equal(res.status, 408)
  assert.deepEqual(await res.json(), FILA_CHEIA)
})
