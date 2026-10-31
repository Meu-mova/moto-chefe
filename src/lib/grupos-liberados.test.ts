import { test } from 'node:test'
import assert from 'node:assert/strict'
import { usuarioDaRede } from './grupos-liberados'
import { gruposVisiveis, podeVerGrupo } from './acesso-grupo'

const PROPRIA = 'conta-propria'
const DONA = 'conta-dona'
const usuario = (papel: string) => ({ papel, lojaId: 'loja-casa', contaId: PROPRIA, gruposAcesso: [], gruposAprovacao: [] })
const LIBERADO = { grupoId: 'grupo-liberado', contaId: DONA }
const grupo = (id: string, contaId: string) => ({ id, contaId })

test('admin_socio comum: liberação não muda nada', () => {
  const u = usuarioDaRede(usuario('admin_socio'), [LIBERADO], LIBERADO.grupoId)
  assert.equal(u.papel, 'admin_socio')
  assert.equal(u.grupoLiberado, null)
  assert.equal(podeVerGrupo(u, null, grupo(LIBERADO.grupoId, DONA)), false)
})

test('admin_rede fora do grupo liberado: opera como admin_socio da própria Conta e vê o liberado no seletor', () => {
  const u = usuarioDaRede(usuario('admin_rede'), [LIBERADO], null)
  assert.equal(u.papel, 'admin_socio')
  assert.equal(u.papelReal, 'admin_rede')
  assert.equal(u.contaId, PROPRIA)
  assert.equal(u.grupoLiberado, null)
  const todos = [grupo('grupo-casa', PROPRIA), grupo(LIBERADO.grupoId, DONA), grupo('outro-da-dona', DONA)]
  assert.deepEqual(gruposVisiveis(u, 'grupo-casa', todos), ['grupo-casa', LIBERADO.grupoId])
})

test('admin_rede no grupo liberado: Conta dona, só aquele grupo, aprova só nele se marcado', () => {
  assert.deepEqual(usuarioDaRede(usuario('admin_rede'), [LIBERADO], LIBERADO.grupoId).gruposAprovacao, [], 'sem aprovação marcada, não aprova')
  const u = usuarioDaRede({ ...usuario('admin_rede'), gruposAprovacao: [LIBERADO.grupoId] }, [LIBERADO], LIBERADO.grupoId)
  assert.equal(u.papel, 'admin_socio')
  assert.equal(u.contaId, DONA)
  assert.equal(u.lojaId, null)
  assert.equal(u.grupoLiberado, LIBERADO.grupoId)
  assert.deepEqual(u.gruposAprovacao, [LIBERADO.grupoId])
  assert.equal(podeVerGrupo(u, null, grupo(LIBERADO.grupoId, DONA)), true)
  assert.equal(podeVerGrupo(u, null, grupo('outro-da-dona', DONA)), false, 'outro grupo da Conta dona')
  assert.equal(podeVerGrupo(u, null, grupo('grupo-casa', PROPRIA)), false, 'na persona, nem a própria Conta')
  assert.deepEqual(u.origem, { lojaId: 'loja-casa', contaId: PROPRIA, gruposAcesso: [], gruposLiberados: [LIBERADO] })
})

test('cookie de grupo não liberado (ou revogado): sem persona', () => {
  const u = usuarioDaRede(usuario('admin_rede'), [], LIBERADO.grupoId)
  assert.equal(u.contaId, PROPRIA)
  assert.equal(u.grupoLiberado, null)
  assert.equal(podeVerGrupo(u, null, grupo(LIBERADO.grupoId, DONA)), false)
})

test('liberação de grupo da própria Conta não vira persona', () => {
  const u = usuarioDaRede(usuario('admin_rede'), [{ grupoId: 'grupo-casa', contaId: PROPRIA }], 'grupo-casa')
  assert.equal(u.grupoLiberado, null)
  assert.equal(u.contaId, PROPRIA)
})

test('telas fora do seletor (usuários, mensalidade) não contam o grupo liberado', () => {
  const todos = [grupo('grupo-casa', PROPRIA), grupo(LIBERADO.grupoId, DONA), grupo('outro-da-dona', DONA)]
  const emCasa = usuarioDaRede(usuario('admin_rede'), [LIBERADO], null)
  assert.deepEqual(gruposVisiveis({ ...emCasa, gruposLiberados: [] }, 'grupo-casa', todos), ['grupo-casa'])
  const persona = usuarioDaRede(usuario('admin_rede'), [LIBERADO], LIBERADO.grupoId)
  assert.deepEqual(gruposVisiveis({ ...persona, gruposLiberados: [] }, null, todos), [LIBERADO.grupoId])
})
