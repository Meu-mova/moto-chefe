import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rotuloDoPapel } from './rotulo-do-papel'

test('quem tem cargo vê o nome do cargo no menu, não "cargo"', () => {
  assert.equal(rotuloDoPapel({ papel: 'cargo', cargoNome: 'Gerente' }), 'Gerente')
})

test('papel fixo mostra o rótulo do papel; admin de rede continua admin de rede', () => {
  assert.equal(rotuloDoPapel({ papel: 'vendedor', cargoNome: null }), 'Vendedor')
  assert.equal(rotuloDoPapel({ papel: 'admin_rede' }), 'Admin de Rede')
})

test('cargo que a consulta não achou mostra "Cargo da Conta", não "cargo" cru', () => {
  assert.equal(rotuloDoPapel({ papel: 'cargo', cargoNome: null }), 'Cargo da Conta')
})
