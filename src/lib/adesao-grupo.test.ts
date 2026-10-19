import { test } from 'node:test'
import assert from 'node:assert/strict'
import { avisoCnpjDoGrupo, motivoBloqueioVinculo } from './adesao-grupo'

test('mesmo CNPJ, com ou sem máscara, não avisa', () => {
  assert.equal(avisoCnpjDoGrupo('11222333000181', '11.222.333/0001-81'), null)
})

test('CNPJ diferente avisa', () => {
  assert.match(avisoCnpjDoGrupo('11222333000181', '99888777000166')!, /CNPJ do grupo é diferente/)
})

test('adesão ainda sem CNPJ não avisa', () => {
  assert.equal(avisoCnpjDoGrupo(null, '99888777000166'), null)
})

test('só liga grupo com contrato assinado e adesão não recusada', () => {
  assert.equal(motivoBloqueioVinculo({ grupoId: 'g1', statusAdesao: 'dados_completos', contratoAssinado: true }), null)
  assert.match(motivoBloqueioVinculo({ grupoId: 'g1', statusAdesao: 'dados_completos', contratoAssinado: false })!, /contrato for assinado/)
  assert.match(motivoBloqueioVinculo({ grupoId: 'g1', statusAdesao: 'recusada', contratoAssinado: true })!, /recusada/)
})

test('desligar o grupo é sempre permitido', () => {
  assert.equal(motivoBloqueioVinculo({ grupoId: null, statusAdesao: 'recusada', contratoAssinado: false }), null)
})
