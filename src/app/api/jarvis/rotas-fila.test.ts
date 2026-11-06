import { test, mock, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server'
import { EsperaEsgotada } from '@/lib/limitar-concorrencia'

// Fronteira de fora: a conexão com o banco. A fila do Jarvis responde como se estivesse cheia.
const TOKEN = 'token-de-teste'
before(() => { process.env.JARVIS_API_TOKEN = TOKEN })
after(() => { delete process.env.JARVIS_API_TOKEN })
mock.module('@/lib/jarvis/conexao', {
  namedExports: { comClientJarvis: async () => { throw new EsperaEsgotada(10_000) } },
})

const FILA_CHEIA = { erro: 'consulta demorou demais', detalhe: 'muitas consultas ao mesmo tempo' }
const pedido = (caminho: string, init: { method?: string; body?: string } = {}) =>
  new NextRequest(`http://localhost${caminho}`, { ...init, headers: { authorization: `Bearer ${TOKEN}`, 'content-type': 'application/json' } })

test('consulta com a fila cheia responde 408 e diz para tentar de novo', async () => {
  const { POST } = await import('./consulta/route')
  const res = await POST(pedido('/api/jarvis/consulta', { method: 'POST', body: JSON.stringify({ sql: 'select 1' }) }))
  assert.equal(res.status, 408)
  assert.deepEqual(await res.json(), FILA_CHEIA)
})
