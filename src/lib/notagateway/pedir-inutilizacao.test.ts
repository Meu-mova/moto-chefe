// O pedido de inutilização na Nota Gateway (#504, #597): o que vai no POST e o que sai de
// cada resposta. Só as mensagens da lista documentada chegam a motivo, tela e log; o resto da
// resposta fica de fora, inclusive um 4xx que ecoe o caminho com o empresaId.
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { InutilizacaoRecusada, NotaGatewayIndisponivel, pedirInutilizacao } from './client'

const cfg = { token: 'TOKEN-SECRETO-123', empresaId: 'EMPRESA-SECRETA-456', ambiente: 'Homologacao' as const }
const pedido = { idExterno: 'nfe-31601-1-inut-1', serie: '1', numeroInicial: 974, numeroFinal: 974, justificativa: 'Venda cancelada apos a rejeicao' }
const original = globalThis.fetch
afterEach(() => { globalThis.fetch = original })

function responder(status: number, corpo = '') {
  const pedidos: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    pedidos.push({ url, init })
    return new Response(corpo, { status })
  }) as typeof fetch
  return pedidos
}

test('POST na rota documentada, com a faixa, o ambiente e a chave da empresa', async () => {
  const pedidos = responder(200)
  await pedirInutilizacao(cfg, pedido)
  assert.equal(pedidos.length, 1)
  const { url, init } = pedidos[0]
  assert.equal(url, 'https://api.notagateway.com.br/v2/empresas/EMPRESA-SECRETA-456/nf-e/inutilizacao')
  assert.equal(init.method, 'POST')
  assert.equal((init.headers as Record<string, string>).Authorization, 'Basic TOKEN-SECRETO-123')
  assert.deepEqual(JSON.parse(String(init.body)), {
    id: 'nfe-31601-1-inut-1', ambienteEmissao: 'Homologacao', serie: '1', numeroInicial: 974, numeroFinal: 974, justificativa: 'Venda cancelada apos a rejeicao',
  })
})

test('4xx com a lista documentada: a recusa leva só as mensagens da lista', async () => {
  responder(400, JSON.stringify([{ codigo: 'GW002', mensagem: 'Payload invalido' }, { codigo: 'GW003', mensagem: 'Serie obrigatoria' }]))
  await assert.rejects(pedirInutilizacao(cfg, pedido), (e: Error) => {
    assert.ok(e instanceof InutilizacaoRecusada)
    assert.equal(e.message, 'Payload invalido; Serie obrigatoria')
    return true
  })
})

test('4xx fora da lista documentada: só o status, sem o corpo, o empresaId ou o token', async () => {
  responder(404, 'Rota /empresas/EMPRESA-SECRETA-456/nf-e/inutilizacao nao encontrada')
  await assert.rejects(pedirInutilizacao(cfg, pedido), (e: Error) => {
    assert.ok(e instanceof InutilizacaoRecusada)
    assert.equal(e.message, 'HTTP 404')
    return true
  })
})

test('5xx: indisponível só com o status, sem o corpo', async () => {
  responder(503, 'upstream EMPRESA-SECRETA-456 timeout')
  await assert.rejects(pedirInutilizacao(cfg, pedido), (e: Error) => {
    assert.ok(e instanceof NotaGatewayIndisponivel)
    assert.equal(e.status, 503)
    assert.equal(e.message, 'Nota Gateway com erro interno (503)')
    return true
  })
})
