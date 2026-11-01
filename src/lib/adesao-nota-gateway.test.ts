import { test } from 'node:test'
import assert from 'node:assert/strict'
import { camposIdentificacao, camposLocalizacao, faltandoParaNg, numeracaoSugerida, type DadosAdesaoNg } from './adesao-nota-gateway'

const A: DadosAdesaoNg = {
  razaoSocial: 'EMPRESA TESTE LTDA', nomeFantasia: null, cnpj: '12345678000195', telefone: '1133330000',
  sedeCep: '01001-000', sedeLogradouro: 'Rua de Teste', sedeNumero: '100', sedeComplemento: null,
  sedeBairro: 'Centro', sedeCidade: 'São Paulo', sedeUf: 'SP', sedeCodigoIbge: '3550308',
  situacaoCadastral: 'ATIVA', regime: 'simples', inscricaoEstadual: null, ieIsenta: false,
  inscricaoMunicipal: '98765', emailNotas: 'contador@exemplo.com', nfSerieAnterior: null, nfUltimoNumero: null,
}

test('CEP e CNPJ vão só com dígitos, no formato que o painel da NG aceita', () => {
  assert.equal(camposLocalizacao(A)[0].valor, '01001000')
  assert.equal(camposIdentificacao(A).find(c => c.rotulo === 'CNPJ')?.valor, '12345678000195')
})

test('IE isenta aparece como ISENTO; IE vazia sem isenta entra no que falta', () => {
  assert.equal(camposIdentificacao({ ...A, ieIsenta: true }).find(c => c.rotulo === 'Inscrição estadual')?.valor, 'ISENTO')
  assert.deepEqual(faltandoParaNg(A), ['Inscrição estadual'])
  assert.deepEqual(faltandoParaNg({ ...A, ieIsenta: true }), [])
})

test('numeração: padrão série 1 e 2 do 1; quem já emitia continua da última + 1 em produção', () => {
  assert.deepEqual(numeracaoSugerida(A), [
    { ambiente: 'Produção', serie: '1', proxima: '1', daAdesao: false },
    { ambiente: 'Homologação', serie: '2', proxima: '1', daAdesao: false },
  ])
  assert.deepEqual(numeracaoSugerida({ nfSerieAnterior: '001', nfUltimoNumero: '1532' })[0],
    { ambiente: 'Produção', serie: '1', proxima: '1533', daAdesao: true })
})
