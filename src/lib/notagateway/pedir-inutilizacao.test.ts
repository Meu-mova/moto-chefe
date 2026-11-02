// Pedido e consulta da inutilização na Nota Gateway (#504, #597): o que vai no POST e o que
// sai de cada resposta. Só as mensagens no formato documentado chegam a motivo, tela e log; o
// resto da resposta fica de fora, inclusive um 4xx que ecoe o caminho com o empresaId.
import { afterEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { consultarInutilizacaoNaNg, InutilizacaoRecusada, NotaGatewayIndisponivel, pedirInutilizacao } from './client'
import { cfgDeTeste as cfg, responderComFetch as responder, restaurarFetch } from './fetch-de-teste'

const pedido = { idExterno: 'nfe-31601-1-inut-1', serie: '1', numeroInicial: 974, numeroFinal: 974, justificativa: 'Venda cancelada apos a rejeicao' }
afterEach(restaurarFetch)

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

test('4xx com a lista no formato documentado: a recusa leva só as mensagens da lista', async () => {
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

test('consulta: GET pelo id; 404 é "ainda não conhece"; 4xx fora do formato documentado só com o status', async () => {
  const pedidos = responder(200, JSON.stringify({ status: 'Autorizada', motivoStatus: null, protocoloAutorizacao: '135' }))
  assert.deepEqual(await consultarInutilizacaoNaNg(cfg, 'nfe-31601-1-inut-1'), { status: 'Autorizada', motivoStatus: null, protocolo: '135' })
  assert.equal(pedidos[0].url, 'https://api.notagateway.com.br/v2/empresas/EMPRESA-SECRETA-456/nf-e/inutilizacao/nfe-31601-1-inut-1')
  assert.equal(pedidos[0].init.method, 'GET')

  responder(404, 'nao encontrada')
  assert.equal(await consultarInutilizacaoNaNg(cfg, 'nfe-31601-1-inut-1'), null)

  responder(400, 'Rota /empresas/EMPRESA-SECRETA-456/nf-e/inutilizacao invalida')
  await assert.rejects(consultarInutilizacaoNaNg(cfg, 'nfe-31601-1-inut-1'), (e: Error) => {
    assert.equal(e.message, 'Falha ao consultar a inutilização: HTTP 400')
    return true
  })
})
