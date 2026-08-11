import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonizar, docHash, sha256, type Evidencias } from './hash'

const EV: Evidencias = {
  documentoId: 'd1', vendaId: 'v1', tipo: 'contrato_venda',
  snapshotHash: 'aaa', selfieHash: 'bbb', assinaturaHash: 'ccc',
  celularDestino: '5535999998888', ipAssinatura: '187.1.2.3',
  userAgent: 'Mozilla/5.0', codigoVerificadoEm: '2026-08-11T14:30:00.000Z',
  assinadoEm: '2026-08-11T14:32:00.000Z',
}

test('canonização não depende da ordem das chaves do objeto', () => {
  const invertido = Object.fromEntries(Object.entries(EV).reverse()) as Evidencias
  assert.equal(canonizar(invertido), canonizar(EV))
})

test('hash é estável para a mesma evidência', () => {
  assert.equal(docHash(EV), docHash({ ...EV }))
})

test('mudar qualquer evidência muda o hash', () => {
  const campos = Object.keys(EV) as (keyof Evidencias)[]
  for (const campo of campos) {
    const alterado = { ...EV, [campo]: `${EV[campo]}-x` }
    assert.notEqual(docHash(alterado), docHash(EV), `hash não mudou ao alterar ${campo}`)
  }
})

test('canonizar não deixa campo de fora — se o tipo cresce, o hash acompanha', () => {
  const serializado = JSON.parse(canonizar(EV)) as Record<string, string>
  assert.deepEqual(Object.keys(serializado).sort(), Object.keys(EV).sort())
})

test('sha256 devolve hex de 64 caracteres', () => {
  assert.match(sha256('mova'), /^[0-9a-f]{64}$/)
  assert.equal(sha256('mova'), sha256(Buffer.from('mova')))
})
