import { test } from 'node:test'
import assert from 'node:assert/strict'
import { linhasDoEmitente } from './emitente-danfe'

const cuiaba = {
  razaoSocial: 'ECO-WHEELS MOBILIDADE E DIVERSAO LTDA',
  logradouro: 'Avenida Exemplo', numero: '1000', complemento: 'Sala 2', bairro: 'Centro',
  cep: '78000000', cidade: 'Cuiabá', uf: 'MT', cnpj: '49366097000140',
  telefone: '6533330000', email: 'contato@exemplo.com.br', site: 'www.exemplo.com.br',
}

test('linhas no padrão do Sul de Minas: razão social, endereço, bairro, CEP - cidade - UF, CNPJ, fone, site e e-mail', () => {
  assert.deepEqual(linhasDoEmitente(cuiaba), {
    titulo: 'ECO-WHEELS MOBILIDADE E DIVERSAO LTDA',
    linhas: [
      'Avenida Exemplo, 1000, Sala 2',
      'Centro',
      '78.000-000 - Cuiabá - MT',
      'CNPJ 49.366.097/0001-40',
      'Fone (65) 3333-0000',
      'www.exemplo.com.br',
      'contato@exemplo.com.br',
    ],
  })
})

test('dado vazio não vira linha', () => {
  const r = linhasDoEmitente({ ...cuiaba, complemento: '', bairro: ' ', telefone: null, site: '', email: null })
  assert.deepEqual(r.linhas, ['Avenida Exemplo, 1000', '78.000-000 - Cuiabá - MT', 'CNPJ 49.366.097/0001-40'])
})

test('celular com 11 dígitos sai com o 9 na frente', () => {
  assert.ok(linhasDoEmitente({ ...cuiaba, telefone: '65999887766' }).linhas.includes('Fone (65) 99988-7766'))
})
