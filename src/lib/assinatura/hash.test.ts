import { test } from 'node:test'
import assert from 'node:assert/strict'
import { canonizar, docHash, docHashAdesao, sha256, type Evidencias, type EvidenciasAdesao } from './hash'

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

const EV_ADESAO: EvidenciasAdesao = {
  contratoId: 'c1', adesaoId: 'a1', snapshotHash: 'aaa', selfieHash: 'bbb', assinaturaHash: 'ccc',
  emailDestino: 'loja@teste.com', ipAssinatura: '187.1.2.3', userAgent: 'Mozilla/5.0',
  codigoVerificadoEm: '2026-10-16T14:30:00.000Z', assinadoEm: '2026-10-16T14:32:00.000Z',
}

test('adesão: hash estável, independe da ordem das chaves e muda com qualquer evidência', () => {
  const invertido = Object.fromEntries(Object.entries(EV_ADESAO).reverse()) as EvidenciasAdesao
  assert.equal(docHashAdesao(invertido), docHashAdesao(EV_ADESAO))
  for (const campo of Object.keys(EV_ADESAO) as (keyof EvidenciasAdesao)[]) {
    assert.notEqual(docHashAdesao({ ...EV_ADESAO, [campo]: `${EV_ADESAO[campo]}-x` }), docHashAdesao(EV_ADESAO), campo)
  }
})
