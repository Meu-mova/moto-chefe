import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DADOS_TRANSPORTE_VAZIOS, MODALIDADES_FRETE, transporteDoPayload, validarDadosTransporte } from './transporte'

test('oferece só as modalidades confirmadas; a 0 fica de fora até a NG confirmar token e XML', () => {
  assert.deepEqual(MODALIDADES_FRETE.map(([token]) => token), [
    'PorContaDoDestinatario', 'PorContaDeTerceiros',
    'TransporteProprioPorContaDoRemetente', 'TransporteProprioPorContaDoDestinatario', 'SemTransporte',
  ])
})

test('bloqueia a transmissão quando a modalidade não foi escolhida', () => {
  const resultado = validarDadosTransporte(DADOS_TRANSPORTE_VAZIOS, false)
  assert.deepEqual(resultado, { ok: false, erro: 'Selecione a modalidade do frete.' })
})

test('faturamento direto bloqueia a transmissão enquanto faltam dados de entrega', () => {
  const resultado = validarDadosTransporte({ ...DADOS_TRANSPORTE_VAZIOS, modalidade: 'SemTransporte' }, true)
  assert.deepEqual(resultado, {
    ok: false,
    erro: 'Preencha os dados de entrega: CPF ou CNPJ do destinatário, logradouro, número, bairro, código IBGE do município, UF.',
  })
})

test('normaliza endereço direto completo e conserva código do frete', () => {
  const resultado = validarDadosTransporte({
    ...DADOS_TRANSPORTE_VAZIOS,
    modalidade: 'SemTransporte',
    enderecoEntrega: {
      tipoPessoaDestinatario: 'F', cpfCnpjDestinatario: '352.817.650-43', logradouro: ' Rua A ',
      numero: ' 10 ', bairro: ' Centro ', cidade: '3170701', uf: 'mg',
    },
  }, true)
  assert.deepEqual(resultado, {
    ok: true,
    dados: {
      modalidade: 'SemTransporte',
      enderecoEntrega: {
        tipoPessoaDestinatario: 'F', cpfCnpjDestinatario: '35281765043', logradouro: 'Rua A',
        numero: '10', bairro: 'Centro', cidade: '3170701', uf: 'MG',
      },
    },
  })
})

test('revenda comum exige modalidade, mas não endereço de entrega', () => {
  const resultado = validarDadosTransporte({ modalidade: 'PorContaDoDestinatario' }, false)
  assert.deepEqual(resultado, { ok: true, dados: { modalidade: 'PorContaDoDestinatario' } })
})

test('código IBGE precisa ter sete dígitos', () => {
  const resultado = validarDadosTransporte({
    ...DADOS_TRANSPORTE_VAZIOS,
    modalidade: 'PorContaDoDestinatario',
    enderecoEntrega: {
      ...DADOS_TRANSPORTE_VAZIOS.enderecoEntrega,
      cpfCnpjDestinatario: '35281765043', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Varginha', uf: 'MG',
    },
  }, true)
  assert.deepEqual(resultado, { ok: false, erro: 'Código IBGE do município deve ter 7 dígitos.' })
})

test('rejeita CPF com dígitos verificadores inválidos no local de entrega', () => {
  const resultado = validarDadosTransporte({
    ...DADOS_TRANSPORTE_VAZIOS,
    modalidade: 'TransporteProprioPorContaDoDestinatario',
    enderecoEntrega: {
      ...DADOS_TRANSPORTE_VAZIOS.enderecoEntrega,
      cpfCnpjDestinatario: '11111111111', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: '3170701', uf: 'MG',
    },
  }, true)
  assert.deepEqual(resultado, { ok: false, erro: 'CPF do destinatário inválido.' })
})

test('recusa modalidade desconhecida recebida fora das opções da tela', () => {
  const dados = { modalidade: 'FreteDesconhecido' } as unknown as Parameters<typeof validarDadosTransporte>[0]
  assert.deepEqual(validarDadosTransporte(dados, false), {
    ok: false, erro: 'Modalidade do frete inválida.',
  })
})

test('transporteDoPayload devolve a modalidade e a entrega que foram enviadas, sem o país', () => {
  const entrega = { tipoPessoaDestinatario: 'F', cpfCnpjDestinatario: '35281765043', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: '3170701', uf: 'MG' }
  const payload = { transporte: { frete: { modalidade: 'TransporteProprioPorContaDoDestinatario' }, enderecoEntrega: { ...entrega, pais: null } } }
  assert.deepEqual(transporteDoPayload(payload), { modalidade: 'TransporteProprioPorContaDoDestinatario', enderecoEntrega: entrega })
})

test('transporteDoPayload não presume nada de payload antigo, vazio ou com modalidade desconhecida', () => {
  assert.equal(transporteDoPayload({}), null)
  assert.equal(transporteDoPayload(null), null)
  assert.equal(transporteDoPayload({ transporte: { frete: { modalidade: 'Inventada' } } }), null)
})

test('transporteDoPayload sem endereço de entrega devolve só a modalidade', () => {
  assert.deepEqual(transporteDoPayload({ transporte: { frete: { modalidade: 'SemTransporte' } } }), { modalidade: 'SemTransporte' })
})
