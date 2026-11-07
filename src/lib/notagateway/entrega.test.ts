// Entrega da venda que chega do navegador (#725): o servidor só grava o que a regra aceita.
import test from 'node:test'
import assert from 'node:assert/strict'
import { conferirEntrega, conflitoDaUfDoFormulario, enderecoDaEntregaEmLinha, operacaoDaVenda, pendenciasDaEntrega, textoDaOperacao, type EntregaVenda } from './entrega'

test('retira na loja com uma modalidade da lista é aceita como veio', () => {
  assert.deepEqual(
    conferirEntrega({ modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' }),
    { ok: true, entrega: { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' } },
  )
})

test('retira na loja sem modalidade é aceita: a prévia da NF avisa depois', () => {
  assert.deepEqual(conferirEntrega({ modo: 'retira', modalidade: '' }), { ok: true, entrega: { modo: 'retira', modalidade: '' } })
})

test('modalidade fora da lista 4.0 é recusada, inclusive o SemTransporte antigo', () => {
  for (const modalidade of ['SemTransporte', 'PorContaDoDestinatario', 'qualquer']) {
    assert.deepEqual(conferirEntrega({ modo: 'retira', modalidade }), { ok: false, erro: 'Modalidade do frete inválida.' })
  }
})

test('sem entrega, ou com um modo que não existe, é recusada', () => {
  for (const dado of [undefined, null, {}, 'retira', { modo: 'buscar', modalidade: '' }, { modo: 'retira' }]) {
    assert.deepEqual(conferirEntrega(dado), { ok: false, erro: 'Escolha a entrega da venda.' })
  }
})

test('campo a mais que o navegador mande não é gravado', () => {
  assert.deepEqual(
    conferirEntrega({ modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte', valorFrete: 999 }),
    { ok: true, entrega: { modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte' } },
  )
})

// "Entregar" (#726): o endereço sai do Novo pedido; quem recebe vazio é o comprador, lido na hora da NF.
const LOCAL_MA = {
  cep: '65000-000', logradouro: ' Rua de exemplo ', numero: '100', complemento: '', bairro: 'Centro',
  cidade: '2111300', nomeCidade: 'São Luís', uf: 'ma',
}
const ENTREGAR_MA: EntregaVenda = {
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente',
  endereco: { cep: '65000000', logradouro: 'Rua de exemplo', numero: '100', complemento: '', bairro: 'Centro', cidade: '2111300', nomeCidade: 'São Luís', uf: 'MA' },
  recebe: null,
}

test('entregar com o endereço completo e o comprador recebendo grava o endereço limpo, sem campo a mais', () => {
  assert.deepEqual(
    conferirEntrega({ modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente', endereco: { ...LOCAL_MA, extra: 1 }, recebe: null, valorFrete: 9 }),
    { ok: true, entrega: ENTREGAR_MA },
  )
})

test('entregar sem a modalidade grava: a prévia da NF avisa depois, como na retirada', () => {
  const r = conferirEntrega({ modo: 'entregar', modalidade: '', endereco: LOCAL_MA, recebe: null })
  assert.deepEqual(r, { ok: true, entrega: { ...ENTREGAR_MA, modalidade: '' } })
})

test('entregar sem endereço, ou com campo da NF faltando, diz o que falta', () => {
  assert.deepEqual(conferirEntrega({ modo: 'entregar', modalidade: '', recebe: null }),
    { ok: false, erro: 'Preencha os dados de entrega: logradouro, número, bairro, código IBGE do município, UF.' })
  assert.deepEqual(conferirEntrega({ modo: 'entregar', modalidade: '', endereco: { ...LOCAL_MA, bairro: ' ' }, recebe: null }),
    { ok: false, erro: 'Preencha os dados de entrega: bairro.' })
})

test('entregar com município fora do código IBGE, UF inválida, CEP incompleto ou texto longo demais é recusado', () => {
  const com = (campo: Partial<typeof LOCAL_MA>) => conferirEntrega({ modo: 'entregar', modalidade: '', endereco: { ...LOCAL_MA, ...campo }, recebe: null })
  assert.deepEqual(com({ cidade: 'São Luís' }), { ok: false, erro: 'Código IBGE do município deve ter 7 dígitos.' })
  assert.deepEqual(com({ uf: 'XX' }), { ok: false, erro: 'UF de entrega inválida.' })
  assert.deepEqual(com({ cep: '65000' }), { ok: false, erro: 'O CEP da entrega deve ter 8 dígitos.' })
  assert.deepEqual(com({ complemento: 'x'.repeat(61) }), { ok: false, erro: 'O complemento da entrega aceita no máximo 60 caracteres.' })
  assert.deepEqual(com({ uf: 'PI' }), { ok: false, erro: 'O código IBGE do município não é da UF de entrega.' })
  assert.deepEqual(com({ nomeCidade: 'x'.repeat(61) }), { ok: false, erro: 'A cidade da entrega aceita no máximo 60 caracteres.' })
})

test('outra pessoa recebe: nome e CPF/CNPJ conferidos como os do comprador (ADR-0015)', () => {
  const recebe = (r: unknown) => conferirEntrega({ modo: 'entregar', modalidade: '', endereco: LOCAL_MA, recebe: r })
  assert.deepEqual(recebe({ nome: ' Maria Exemplo ', cpfCnpj: '529.982.247-25' }),
    { ok: true, entrega: { ...ENTREGAR_MA, modalidade: '', recebe: { nome: 'Maria Exemplo', cpfCnpj: '52998224725' } } })
  assert.deepEqual(recebe({ nome: 'Maria Exemplo', cpfCnpj: '529.982.247-24' }), { ok: false, erro: 'CPF inválido. Confira os números.' })
  assert.deepEqual(recebe({ nome: '', cpfCnpj: '529.982.247-25' }), { ok: false, erro: 'Informe o nome de quem recebe.' })
  assert.deepEqual(recebe({ nome: 'x'.repeat(61), cpfCnpj: '529.982.247-25' }), { ok: false, erro: 'O nome de quem recebe aceita no máximo 60 caracteres.' })
})

// Dentro ou fora do estado pela Entrega (#682 Q1, com as exceções do contador de Teresina em 05/11).
const RETIRA: EntregaVenda = { modo: 'retira', modalidade: 'TransporteProprioPorContaDoDestinatario' }
const PI_PARA_MA = { ufEmitente: 'PI', ufCliente: 'MA', clienteContribuinte: false, ciclomotor: false }

test('retira na loja com cliente de outra UF é venda dentro do estado', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: RETIRA }),
    { interestadual: false, motivo: 'retira', ufOrigem: 'PI', ufDestino: 'PI' })
})

test('retira na loja de moto que se emplaca (ciclomotor), cliente de outra UF, é para outro estado', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: RETIRA, ciclomotor: true }),
    { interestadual: true, motivo: 'retira_ciclomotor', ufOrigem: 'PI', ufDestino: 'MA' })
})

test('retira na loja de cliente contribuinte (com IE) de outra UF é para outro estado', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: RETIRA, clienteContribuinte: true }),
    { interestadual: true, motivo: 'retira_contribuinte', ufOrigem: 'PI', ufDestino: 'MA' })
})

test('as exceções só valem para cliente de outra UF: ciclomotor e contribuinte da UF da loja ficam dentro do estado', () => {
  const mesmaUf = { ...PI_PARA_MA, ufCliente: 'pi', entrega: RETIRA, ciclomotor: true, clienteContribuinte: true }
  assert.deepEqual(operacaoDaVenda(mesmaUf), { interestadual: false, motivo: 'retira', ufOrigem: 'PI', ufDestino: 'PI' })
})

test('venda sem Entrega segue a regra antiga: a UF do cliente decide', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: null }),
    { interestadual: true, motivo: 'sem_entrega', ufOrigem: 'PI', ufDestino: 'MA' })
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, ufCliente: 'PI', entrega: null }),
    { interestadual: false, motivo: 'sem_entrega', ufOrigem: 'PI', ufDestino: 'PI' })
})

test('o selo diz dentro ou fora do estado com as UFs, e o porquê diz qual regra decidiu', () => {
  assert.deepEqual(textoDaOperacao({ interestadual: false, motivo: 'retira', ufOrigem: 'PI', ufDestino: 'PI' }),
    { selo: 'Dentro do estado (PI para PI)', porque: 'O cliente retira a moto na loja: vale a regra de dentro do estado.' })
  assert.deepEqual(textoDaOperacao({ interestadual: true, motivo: 'retira_ciclomotor', ufOrigem: 'PI', ufDestino: 'MA' }),
    { selo: 'Para outro estado (PI para MA)', porque: 'O cliente retira na loja, mas a moto se emplaca no estado dele (ciclomotor): a venda é para outro estado.' })
  assert.deepEqual(textoDaOperacao({ interestadual: true, motivo: 'retira_contribuinte', ufOrigem: 'PI', ufDestino: 'MA' }),
    { selo: 'Para outro estado (PI para MA)', porque: 'O cliente retira na loja, mas tem inscrição estadual em outro estado: a venda é para outro estado.' })
  assert.deepEqual(textoDaOperacao({ interestadual: true, motivo: 'sem_entrega', ufOrigem: 'PI', ufDestino: 'MA' }),
    { selo: 'Para outro estado (PI para MA)', porque: 'Esta venda não tem a Entrega informada: vale a UF do endereço do cliente. Confira antes de emitir.' })
})

test('venda com Entrega e sem modalidade do frete não emite; com modalidade ou sem Entrega (venda antiga), nada pende', () => {
  assert.deepEqual(pendenciasDaEntrega({ modo: 'retira', modalidade: '' }, 'Cliente'),
    ['Falta a modalidade do frete na Entrega da venda. Corrija a Entrega na venda para a nota sair.'])
  assert.deepEqual(pendenciasDaEntrega({ modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte' }, 'Cliente'), [])
  assert.deepEqual(pendenciasDaEntrega(null, 'Cliente'), [])
})

test('entregar em outra UF que a do emitente é para outro estado, qualquer que seja a UF do cliente', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: ENTREGAR_MA }),
    { interestadual: true, motivo: 'entregar', ufOrigem: 'PI', ufDestino: 'MA' })
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, ufCliente: 'PI', entrega: ENTREGAR_MA }),
    { interestadual: true, motivo: 'entregar', ufOrigem: 'PI', ufDestino: 'MA' })
})

const ENTREGAR_PI: EntregaVenda = { ...ENTREGAR_MA, endereco: { ...ENTREGAR_MA.endereco, cidade: '2211001', uf: 'PI' } } as EntregaVenda

test('entregar na UF do emitente é dentro do estado, mesmo com cliente de outra UF', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: ENTREGAR_PI }),
    { interestadual: false, motivo: 'entregar', ufOrigem: 'PI', ufDestino: 'PI' })
})

// Decisão do Luis (07/11/2026, #726): as exceções da retirada valem também para "Entregar" na UF do emitente.
test('entregar na UF do emitente de ciclomotor para cliente de outra UF é para outro estado', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: ENTREGAR_PI, ciclomotor: true }),
    { interestadual: true, motivo: 'entregar_ciclomotor', ufOrigem: 'PI', ufDestino: 'MA' })
})

test('entregar na UF do emitente para cliente contribuinte (com IE) de outra UF é para outro estado', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, entrega: ENTREGAR_PI, clienteContribuinte: true }),
    { interestadual: true, motivo: 'entregar_contribuinte', ufOrigem: 'PI', ufDestino: 'MA' })
})

test('o porquê das exceções da entrega na UF da loja', () => {
  assert.equal(textoDaOperacao({ interestadual: true, motivo: 'entregar_ciclomotor', ufOrigem: 'PI', ufDestino: 'MA' }).porque,
    'A loja entrega no estado dela, mas a moto se emplaca no estado do cliente (ciclomotor): a venda é para outro estado.')
  assert.equal(textoDaOperacao({ interestadual: true, motivo: 'entregar_contribuinte', ufOrigem: 'PI', ufDestino: 'MA' }).porque,
    'A loja entrega no estado dela, mas o cliente tem inscrição estadual em outro estado: a venda é para outro estado.')
})

test('o porquê da entrega diz que vale a UF do endereço de entrega', () => {
  assert.deepEqual(textoDaOperacao({ interestadual: true, motivo: 'entregar', ufOrigem: 'PI', ufDestino: 'MA' }),
    { selo: 'Para outro estado (PI para MA)', porque: 'A loja entrega a moto: vale a UF do endereço de entrega.' })
})

// Decisão do Luis (07/11/2026): no faturamento direto o endereço de entrega ainda vem do formulário da nota (#728).
test('faturamento direto: a UF do formulário diferente da Entrega da venda impede a nota; igual, ou sem "Entregar", não', () => {
  const formulario = (uf: string) => ({ modalidade: 'TransporteProprioPorContaDoRemetente' as const,
    enderecoEntrega: { tipoPessoaDestinatario: 'F' as const, cpfCnpjDestinatario: '52998224725', logradouro: 'R', numero: '1', bairro: 'B', cidade: '2111300', uf } })
  assert.equal(conflitoDaUfDoFormulario(ENTREGAR_MA, formulario('PI')),
    'A UF da entrega no formulário da nota é diferente da Entrega da venda. Corrija antes de emitir.')
  assert.equal(conflitoDaUfDoFormulario(ENTREGAR_MA, formulario('ma')), null)
  assert.equal(conflitoDaUfDoFormulario({ modo: 'retira', modalidade: '' }, formulario('PI')), null)
  assert.equal(conflitoDaUfDoFormulario(null, formulario('PI')), null)
  assert.equal(conflitoDaUfDoFormulario(ENTREGAR_MA, undefined), null)
})

test('entregar ao próprio comprador com nome acima de 60 caracteres: a prévia pede para corrigir o nome do cliente', () => {
  const longo = 'x'.repeat(61)
  assert.deepEqual(pendenciasDaEntrega(ENTREGAR_MA, longo),
    ['O nome do cliente passa de 60 caracteres, o limite da nota para quem recebe a entrega. Corrija o nome do cliente antes de emitir.'])
  assert.deepEqual(pendenciasDaEntrega(ENTREGAR_MA, 'Cliente'), [])
  assert.deepEqual(pendenciasDaEntrega({ ...ENTREGAR_MA, recebe: { nome: 'Maria', cpfCnpj: '52998224725' } } as EntregaVenda, longo), [])
  assert.deepEqual(pendenciasDaEntrega({ modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte' }, longo), [])
})

test('entregar em outra UF que a do emitente é para outro estado também para contribuinte e ciclomotor da UF da loja', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, ufCliente: 'PI', entrega: ENTREGAR_MA, ciclomotor: true, clienteContribuinte: true }),
    { interestadual: true, motivo: 'entregar', ufOrigem: 'PI', ufDestino: 'MA' })
})

test('o endereço da entrega numa linha, para a efetivação: sem complemento vazio e com o CEP formatado', () => {
  assert.equal(enderecoDaEntregaEmLinha(ENTREGAR_MA.endereco), 'Rua de exemplo, 100, Centro, São Luís/MA, CEP 65000-000')
  assert.equal(enderecoDaEntregaEmLinha({ ...ENTREGAR_MA.endereco, complemento: 'Casa 2', cep: '' }), 'Rua de exemplo, 100, Casa 2, Centro, São Luís/MA')
})
