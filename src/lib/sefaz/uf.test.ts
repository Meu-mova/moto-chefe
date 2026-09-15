import { test } from 'node:test'
import assert from 'node:assert/strict'
import { UFS, codigoDaUf, ufValida } from './uf'

test('as 27 unidades da federação estão na tabela', () => {
  assert.equal(UFS.length, 27)
})

test('sigla e código são únicos — código repetido mandaria o grupo errado pra SEFAZ', () => {
  assert.equal(new Set(UFS.map(u => u.sigla)).size, 27)
  assert.equal(new Set(UFS.map(u => u.codigo)).size, 27)
})

test('todo código tem 2 dígitos, que é o formato do cUFAutor', () => {
  for (const uf of UFS) assert.match(uf.codigo, /^\d{2}$/, `${uf.sigla} tem código fora do formato`)
})

test('as UFs dos grupos de hoje resolvem no código certo', () => {
  // MG: Sul de Minas e BH. SP: Vale (loja Motochefe Pinda, Pindamonhangaba).
  assert.equal(codigoDaUf('MG'), '31')
  assert.equal(codigoDaUf('SP'), '35')
})

test('sigla inexistente falha explícito, sem cair num padrão', () => {
  assert.throws(() => codigoDaUf('XX'), /não é uma sigla válida/)
  // Minúscula não é normalizada de propósito: o valor vem de um <select> com
  // as siglas em maiúscula. Aceitar variação aqui esconderia gravação errada.
  assert.throws(() => codigoDaUf('sp'), /não é uma sigla válida/)
  assert.throws(() => codigoDaUf(''), /não é uma sigla válida/)
})

test('ufValida separa sigla boa de ruim', () => {
  assert.equal(ufValida('SP'), true)
  assert.equal(ufValida('XX'), false)
})
