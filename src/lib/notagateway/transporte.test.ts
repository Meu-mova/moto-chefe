import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DADOS_TRANSPORTE_VAZIOS, MODALIDADES_FRETE, transporteDoPayload, validarDadosTransporte } from './transporte'

test('oferece as 6 modalidades da NF-e 4.0 com o texto da tela, o código do DANFE e o nome da KB 170207 da NG', () => {
  assert.deepEqual(MODALIDADES_FRETE, [
    { texto: 'Sem frete', codigo: 9, token: 'SemOcorrenciaDeTransporte' },
    { texto: 'Cliente leva com veículo próprio', codigo: 4, token: 'TransporteProprioPorContaDoDestinatario' },
    { texto: 'Loja leva com veículo próprio', codigo: 3, token: 'TransporteProprioPorContaDoRemetente' },
    { texto: 'Cliente contrata e paga a transportadora', codigo: 1, token: 'ContratacaoPorContaDoDestinatario' },
    { texto: 'Loja contrata e paga a transportadora', codigo: 0, token: 'ContratacaoPorContaDoRemetente' },
    { texto: 'Outra pessoa contrata o frete', codigo: 2, token: 'ContratacaoPorContaDeTerceiros' },
  ])
})

const ENTREGA_COMPLETA = {
  tipoPessoaDestinatario: 'F' as const, cpfCnpjDestinatario: '35281765043', logradouro: 'Rua A', numero: '10',
  bairro: 'Centro', cidade: '3170701', uf: 'MG',
}

test('aceita a modalidade 0 (loja contrata a transportadora) com o nome da KB 170207', () => {
  const resultado = validarDadosTransporte({ modalidade: 'ContratacaoPorContaDoRemetente', enderecoEntrega: ENTREGA_COMPLETA })
  assert.deepEqual(resultado, { ok: true, dados: { modalidade: 'ContratacaoPorContaDoRemetente', enderecoEntrega: ENTREGA_COMPLETA } })
})

test('recusa SemTransporte, nome que não existe na doc da NG', () => {
  const dados = { modalidade: 'SemTransporte', enderecoEntrega: ENTREGA_COMPLETA } as unknown as Parameters<typeof validarDadosTransporte>[0]
  assert.deepEqual(validarDadosTransporte(dados), { ok: false, erro: 'Modalidade do frete inválida.' })
})

test('bloqueia a transmissão quando a modalidade não foi escolhida', () => {
  const resultado = validarDadosTransporte(DADOS_TRANSPORTE_VAZIOS)
  assert.deepEqual(resultado, { ok: false, erro: 'Selecione a modalidade do frete.' })
})

test('faturamento direto bloqueia a transmissão enquanto faltam dados de entrega', () => {
  const resultado = validarDadosTransporte({ ...DADOS_TRANSPORTE_VAZIOS, modalidade: 'SemOcorrenciaDeTransporte' })
  assert.deepEqual(resultado, {
    ok: false,
    erro: 'Preencha os dados de entrega: CPF ou CNPJ do destinatário, logradouro, número, bairro, código IBGE do município, UF.',
  })
})

test('normaliza endereço direto completo e conserva código do frete', () => {
  const resultado = validarDadosTransporte({
    ...DADOS_TRANSPORTE_VAZIOS,
    modalidade: 'SemOcorrenciaDeTransporte',
    enderecoEntrega: {
      tipoPessoaDestinatario: 'F', cpfCnpjDestinatario: '352.817.650-43', logradouro: ' Rua A ',
      numero: ' 10 ', bairro: ' Centro ', cidade: '3170701', uf: 'mg',
    },
  })
  assert.deepEqual(resultado, {
    ok: true,
    dados: {
      modalidade: 'SemOcorrenciaDeTransporte',
      enderecoEntrega: {
        tipoPessoaDestinatario: 'F', cpfCnpjDestinatario: '35281765043', logradouro: 'Rua A',
        numero: '10', bairro: 'Centro', cidade: '3170701', uf: 'MG',
      },
    },
  })
})

test('código IBGE precisa ter sete dígitos', () => {
  const resultado = validarDadosTransporte({
    ...DADOS_TRANSPORTE_VAZIOS,
    modalidade: 'ContratacaoPorContaDoDestinatario',
    enderecoEntrega: { ...ENTREGA_COMPLETA, cidade: 'Varginha' },
  })
  assert.deepEqual(resultado, { ok: false, erro: 'Código IBGE do município deve ter 7 dígitos.' })
})

test('rejeita CPF com dígitos verificadores inválidos no local de entrega', () => {
  const resultado = validarDadosTransporte({
    ...DADOS_TRANSPORTE_VAZIOS,
    modalidade: 'TransporteProprioPorContaDoDestinatario',
    enderecoEntrega: { ...ENTREGA_COMPLETA, cpfCnpjDestinatario: '11111111111' },
  })
  assert.deepEqual(resultado, { ok: false, erro: 'CPF do destinatário inválido.' })
})

test('recusa modalidade desconhecida recebida fora das opções da tela', () => {
  const dados = { modalidade: 'FreteDesconhecido' } as unknown as Parameters<typeof validarDadosTransporte>[0]
  assert.deepEqual(validarDadosTransporte(dados), {
    ok: false, erro: 'Modalidade do frete inválida.',
  })
})

test('transporteDoPayload devolve a modalidade e a entrega que foram enviadas, sem o país', () => {
  const payload = { transporte: { frete: { modalidade: 'TransporteProprioPorContaDoDestinatario' }, enderecoEntrega: { ...ENTREGA_COMPLETA, pais: null } } }
  assert.deepEqual(transporteDoPayload(payload), { modalidade: 'TransporteProprioPorContaDoDestinatario', enderecoEntrega: ENTREGA_COMPLETA })
})

test('transporteDoPayload não presume nada de payload antigo, vazio ou com modalidade desconhecida', () => {
  assert.equal(transporteDoPayload({}), null)
  assert.equal(transporteDoPayload(null), null)
  assert.equal(transporteDoPayload({ transporte: { frete: { modalidade: 'Inventada' } } }), null)
})

test('transporteDoPayload sem endereço de entrega devolve só a modalidade', () => {
  assert.deepEqual(transporteDoPayload({ transporte: { frete: { modalidade: 'SemOcorrenciaDeTransporte' } } }), { modalidade: 'SemOcorrenciaDeTransporte' })
})

test('o tipo de pessoa do destinatário vem do documento, não do que a tela mandou', () => {
  const entrega = { ...ENTREGA_COMPLETA, tipoPessoaDestinatario: 'J' as const, cpfCnpjDestinatario: '352.817.650-43' }
  const resultado = validarDadosTransporte({ modalidade: 'SemOcorrenciaDeTransporte', enderecoEntrega: entrega })
  assert.equal(resultado.ok && resultado.dados.enderecoEntrega?.tipoPessoaDestinatario, 'F')
})

test('logradouro, número e bairro de entrega aceitam no máximo 60 caracteres (limite do XML)', () => {
  const longo = 'x'.repeat(61)
  for (const [campo, rotulo] of [['logradouro', 'logradouro'], ['numero', 'número'], ['bairro', 'bairro']] as const) {
    assert.deepEqual(validarDadosTransporte({ modalidade: 'SemOcorrenciaDeTransporte', enderecoEntrega: { ...ENTREGA_COMPLETA, [campo]: longo } }),
      { ok: false, erro: `O ${rotulo} da entrega aceita no máximo 60 caracteres.` })
  }
  assert.equal(validarDadosTransporte({ modalidade: 'SemOcorrenciaDeTransporte', enderecoEntrega: { ...ENTREGA_COMPLETA, logradouro: 'x'.repeat(60) } }).ok, true)
})

test('transporteDoPayload lê o nome que o MOVA já gravou (v1.21.1 até o #723) como o nome 4.0 do mesmo código', () => {
  const casos = [
    ['SemTransporte', 'SemOcorrenciaDeTransporte'],
    ['PorContaDoDestinatario', 'ContratacaoPorContaDoDestinatario'],
    ['PorContaDeTerceiros', 'ContratacaoPorContaDeTerceiros'],
  ] as const
  for (const [antigo, atual] of casos) {
    const payload = { transporte: { frete: { modalidade: antigo }, enderecoEntrega: { ...ENTREGA_COMPLETA, pais: null } } }
    assert.deepEqual(transporteDoPayload(payload), { modalidade: atual, enderecoEntrega: ENTREGA_COMPLETA }, antigo)
  }
})

test('transporteDoPayload não traduz nome 3.10 que o MOVA nunca gravou', () => {
  for (const nome of ['SemFrete', 'PorContaDoEmitente']) {
    assert.equal(transporteDoPayload({ transporte: { frete: { modalidade: nome } } }), null, nome)
  }
})
