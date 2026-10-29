import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeConfigurarFiscal, podeOperarNfSaida } from './papeis-nf-saida'

test('emite a NF de saída (e preenche o RENAVE): admin_geral, admin_socio e aux_adm; configura o fiscal: só os sócios', () => {
  for (const papel of ['admin_geral', 'admin_socio', 'aux_adm']) assert.equal(podeOperarNfSaida(papel), true, papel)
  for (const papel of ['vendedor', 'mecanico', 'motorista', 'cargo']) assert.equal(podeOperarNfSaida(papel), false, papel)
  assert.equal(podeConfigurarFiscal('aux_adm'), false)
})
