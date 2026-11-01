import { test } from 'node:test'
import assert from 'node:assert/strict'
import { colunasFiscais, faltaNosImpostos, soDigitos, type DadosFiscais } from './adesao-fiscal'

const CNPJ = '12345678000195'
const base: DadosFiscais = {
  razaoSocial: 'EMPRESA TESTE LTDA', nomeFantasia: 'Loja Teste', telefone: '(11) 3333-0000',
  endereco: { cep: '01001000', logradouro: 'Rua de Teste', numero: '100', complemento: '', bairro: 'Centro', cidade: 'São Paulo', uf: 'sp' },
  codigoIbge: '3550308', situacao: 'ATIVA', regime: 'simples',
  inscricaoEstadual: '123.456.789-ab', ieIsenta: false, inscricaoMunicipal: 'IM 98.765',
  emailNotas: 'contador@exemplo.com', jaEmite: false, nfSerie: '', nfUltimoNumero: '',
}

test('soDigitos tira pontos, traços e letras', () => {
  assert.equal(soDigitos('123.456.789-ab'), '123456789')
  assert.equal(soDigitos('ISENTO'), '')
})

test('servidor grava IE e IM só com dígitos, o CNPJ do A1 e o endereço montado', () => {
  const r = colunasFiscais(base, CNPJ)
  assert.ok(r.ok)
  assert.equal(r.colunas.cnpj, CNPJ)
  assert.equal(r.colunas.inscricaoEstadual, '123456789')
  assert.equal(r.colunas.inscricaoMunicipal, '98765')
  assert.equal(r.colunas.telefone, '1133330000')
  assert.equal(r.colunas.sedeCep, '01001-000')
  assert.equal(r.colunas.sedeUf, 'SP')
  assert.equal(r.colunas.enderecoSede, 'Rua de Teste, 100, Centro, CEP 01001-000, São Paulo – SP')
  assert.equal(r.colunas.nfSerieAnterior, null, 'não emite: série e número ficam vazios')
})

test('CNPJ que vem no formulário é ignorado: vale o do A1', () => {
  const r = colunasFiscais({ ...base, cnpj: '00000000000191' }, CNPJ)
  assert.ok(r.ok)
  assert.equal(r.colunas.cnpj, CNPJ)
})

test('IE isenta grava sem número; sem IE e sem isenta não passa', () => {
  const isenta = colunasFiscais({ ...base, inscricaoEstadual: '999', ieIsenta: true }, CNPJ)
  assert.ok(isenta.ok)
  assert.equal(isenta.colunas.inscricaoEstadual, null)
  assert.equal(faltaNosImpostos({ ...base, inscricaoEstadual: 'abc' }), 'Informe a inscrição estadual ou marque que a loja é isenta')
})

test('quem já emite informa série e última nota, só dígitos', () => {
  assert.equal(faltaNosImpostos({ ...base, jaEmite: true }), 'Informe a série e o número da última nota')
  const r = colunasFiscais({ ...base, jaEmite: true, nfSerie: 'Série 1', nfUltimoNumero: '1.532' }, CNPJ)
  assert.ok(r.ok)
  assert.deepEqual([r.colunas.nfSerieAnterior, r.colunas.nfUltimoNumero], ['1', '1532'])
})

test('série acima de 3 dígitos ou número acima de 9 não passam na adesão', () => {
  assert.deepEqual(colunasFiscais({ ...base, jaEmite: true, nfSerie: '1000', nfUltimoNumero: '1' }, CNPJ), { ok: false, erro: 'Série tem no máximo 3 dígitos' })
  assert.deepEqual(colunasFiscais({ ...base, jaEmite: true, nfSerie: '1', nfUltimoNumero: '1234567890' }, CNPJ), { ok: false, erro: 'Número da nota tem no máximo 9 dígitos' })
})

test('falta de endereço ou regime recusa com a frase do campo', () => {
  assert.deepEqual(colunasFiscais({ ...base, endereco: { ...base.endereco, numero: '' } }, CNPJ), { ok: false, erro: 'Informe o número da empresa' })
  assert.deepEqual(colunasFiscais({ ...base, regime: '' }, CNPJ), { ok: false, erro: 'Escolha o regime de impostos' })
})
