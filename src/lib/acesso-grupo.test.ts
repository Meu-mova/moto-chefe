import { test } from 'node:test'
import assert from 'node:assert/strict'
import { gruposVisiveis, podeVerGrupo } from './acesso-grupo'

const SUL_DE_MINAS = 'grupo-sdm'
const BH = 'grupo-bh'
const VALE = 'grupo-vale'
const TODOS = [SUL_DE_MINAS, BH, VALE]

test('admin_geral vê todos os grupos ativos, mesmo sem lista', () => {
  const cesar = { papel: 'admin_geral', gruposAcesso: null }
  assert.deepEqual(gruposVisiveis(cesar, SUL_DE_MINAS, TODOS), TODOS)
  assert.equal(podeVerGrupo(cesar, SUL_DE_MINAS, BH), true)
  assert.equal(podeVerGrupo(cesar, null, VALE), true)
})

test('lista vazia (padrão de hoje) vê só o grupo da própria loja', () => {
  const vendedor = { papel: 'vendedor', gruposAcesso: [] }
  assert.deepEqual(gruposVisiveis(vendedor, SUL_DE_MINAS, TODOS), [SUL_DE_MINAS])
  assert.equal(podeVerGrupo(vendedor, SUL_DE_MINAS, SUL_DE_MINAS), true)
})

test('sem grupos_acesso definido (undefined) se comporta como lista vazia', () => {
  const auxAdm = { papel: 'aux_adm' }
  assert.deepEqual(gruposVisiveis(auxAdm, BH, TODOS), [BH])
})

test('lista preenchida vê os grupos dela MAIS o da própria loja', () => {
  // João Brito: loja fixa em Itajubá (Sul de Minas), liberado no BH e no Vale.
  const joao = { papel: 'admin_socio', gruposAcesso: [BH, VALE] }
  assert.deepEqual(gruposVisiveis(joao, SUL_DE_MINAS, TODOS), TODOS)
})

test('grupo que não está na lista (nem é a própria loja) é recusado', () => {
  const luiz = { papel: 'admin_socio', gruposAcesso: [BH] }
  assert.deepEqual(gruposVisiveis(luiz, SUL_DE_MINAS, TODOS), [SUL_DE_MINAS, BH])
  assert.equal(podeVerGrupo(luiz, SUL_DE_MINAS, VALE), false)
  assert.equal(podeVerGrupo(luiz, SUL_DE_MINAS, BH), true)
})

test('usuário sem loja e sem lista não vê grupo nenhum, e não explode', () => {
  const semLojaSemLista = { papel: 'admin_socio', gruposAcesso: [] }
  assert.deepEqual(gruposVisiveis(semLojaSemLista, null, TODOS), [])
  assert.equal(podeVerGrupo(semLojaSemLista, null, SUL_DE_MINAS), false)
})

test('gruposVisiveis nunca devolve grupo fora da lista de grupos ativos', () => {
  // Grupo id não listado em todosOsGruposAtivos (ex.: inativado) some da
  // resposta mesmo estando em grupos_acesso.
  const joao = { papel: 'admin_socio', gruposAcesso: [BH, 'grupo-inativo'] }
  assert.deepEqual(gruposVisiveis(joao, SUL_DE_MINAS, TODOS), [SUL_DE_MINAS, BH])
})
