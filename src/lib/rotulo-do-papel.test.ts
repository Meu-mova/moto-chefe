import { test } from 'node:test'
import assert from 'node:assert/strict'
import { papelEnum } from '@/lib/db/schema'
import { OPCOES_DE_PAPEL, ORDEM_DOS_PAPEIS, ROTULO_DO_PAPEL, rotuloDoPapel, rotuloDoPapelGravado } from './rotulo-do-papel'

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

test('o mapa tem um rótulo por papel do banco, nem mais nem menos', () => {
  assert.deepEqual(Object.keys(ROTULO_DO_PAPEL).sort(), [...papelEnum.enumValues].sort())
})

test('a ordem das opções cobre todos os papéis, sem repetir', () => {
  assert.deepEqual([...ORDEM_DOS_PAPEIS].sort(), [...papelEnum.enumValues].sort())
})

test('texto de cada papel nas telas internas', () => {
  assert.deepEqual(OPCOES_DE_PAPEL.map(o => [o.value, o.label]), [
    ['admin_geral', 'Admin Geral'], ['admin_rede', 'Admin de Rede'], ['admin_socio', 'Admin Sócio'],
    ['aux_adm', 'Aux. Administrativo'], ['vendedor', 'Vendedor'], ['mecanico', 'Mecânico'],
    ['motorista', 'Motorista'], ['cargo', 'Cargo da Conta'], ['fabrica', 'Fábrica'],
  ])
})

test('papel gravado: rótulo; valor que não é papel volta como veio', () => {
  assert.equal(rotuloDoPapelGravado('admin_rede'), 'Admin de Rede')
  assert.equal(rotuloDoPapelGravado('xyz'), 'xyz')
})

test('nome herdado do Object não vira rótulo: volta como veio', () => {
  assert.equal(rotuloDoPapelGravado('toString'), 'toString')
})
