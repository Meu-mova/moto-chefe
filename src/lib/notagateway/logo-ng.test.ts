import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { vincularLogoNaNg } from './logo-ng'
import { cfgDeTeste as cfg, responderComFetch as responder, restaurarFetch } from './fetch-de-teste'

afterEach(restaurarFetch)

test('envia o PNG em multipart no campo logotipo para a logo da empresa do grupo', async () => {
  const pedidos = responder(200)
  await vincularLogoNaNg(cfg, Buffer.from('png-bytes'))
  assert.equal(pedidos.length, 1)
  const { url, init } = pedidos[0]
  assert.equal(url, 'https://api.notagateway.com.br/v2/empresas/EMPRESA-SECRETA-456/logo')
  assert.equal(init.method, 'POST')
  assert.equal((init.headers as Record<string, string>).Authorization, 'Basic TOKEN-SECRETO-123')
  const arquivo = (init.body as FormData).get('logotipo') as File
  assert.equal(arquivo.type, 'image/png')
  assert.equal(Buffer.from(await arquivo.arrayBuffer()).toString(), 'png-bytes')
})

test('recusa da NG vira erro só com o status, sem token, empresaId nem a resposta', async () => {
  responder(400, 'empresa EMPRESA-SECRETA-456 inválida')
  await assert.rejects(vincularLogoNaNg(cfg, Buffer.from('x')), (e: Error) => {
    assert.equal(e.message, 'A Nota Gateway não aceitou a logo (HTTP 400). Tente de novo em alguns minutos.')
    return true
  })
})

test('produção fora do app publicado não chama a NG', async () => {
  const pedidos = responder(200)
  await assert.rejects(vincularLogoNaNg({ ...cfg, ambiente: 'Producao' }, Buffer.from('x')))
  assert.equal(pedidos.length, 0)
})
