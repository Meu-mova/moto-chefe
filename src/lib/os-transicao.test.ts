import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeAvancarOS, RESPONSAVEL_TRANSICAO } from './os-transicao'

test('gestor avança a OS pelos passos do mecânico até Finalizada', () => {
  for (const papel of ['admin_geral', 'admin_socio', 'aux_adm']) {
    for (const passo of ['oficina', 'em_andamento', 'finalizada']) {
      assert.equal(podeAvancarOS(passo, papel), true, `${papel} → ${passo}`)
    }
  }
})

test('mecânico continua avançando os próprios passos, mas não manda para pagamento', () => {
  assert.equal(podeAvancarOS('finalizada', 'mecanico'), true)
  assert.equal(podeAvancarOS('pendente_pagamento', 'mecanico'), false)
})

test('vendedor não avança OS; concluída é automática para todos', () => {
  assert.equal(podeAvancarOS('finalizada', 'vendedor'), false)
  assert.equal(podeAvancarOS('concluida', 'admin_geral'), false)
})

test('a tela mostra "aguardando mecânico" nos passos dele', () => {
  assert.equal(RESPONSAVEL_TRANSICAO.finalizada[0], 'mecanico')
})
