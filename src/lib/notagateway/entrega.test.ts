// Entrega da venda que chega do navegador (#725): o servidor só grava o que a regra aceita.
import test from 'node:test'
import assert from 'node:assert/strict'
import { conferirEntrega, conflitoDaUfDoFormulario, enderecoDaEntregaEmLinha, freteDaVenda, motoNaNota, totalComFrete, valorDaMoto, operacaoDaVenda, pendenciasDaEntrega, textoDaEntrega, textoDaOperacao, travaDaEntregaEmOutroEstado, ENTREGA_EM_OUTRO_ESTADO, CANCELE_A_NF_PARA_ALTERAR, entregaParaLog, travaDaAlteracaoDaEntrega, TRAVA_DO_ALTERAR, FRETE_FIXO_NA_VENDA, recusaDoFreteDaVendaEfetivada, SEM_FRETE_NA_VENDA, type EntregaVenda } from './entrega'

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
  assert.deepEqual(pendenciasDaEntrega({ modo: 'retira', modalidade: '' }, 'Cliente', 1000),
    ['Falta a modalidade do frete na Entrega da venda. Corrija a Entrega na venda para a nota sair.'])
  assert.deepEqual(pendenciasDaEntrega({ modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte' }, 'Cliente', 1000), [])
  assert.deepEqual(pendenciasDaEntrega(null, 'Cliente', 1000), [])
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
  assert.deepEqual(pendenciasDaEntrega(ENTREGAR_MA, longo, 1000),
    ['O nome do cliente passa de 60 caracteres, o limite da nota para quem recebe a entrega. Corrija o nome do cliente antes de emitir.'])
  assert.deepEqual(pendenciasDaEntrega(ENTREGAR_MA, 'Cliente', 1000), [])
  assert.deepEqual(pendenciasDaEntrega({ ...ENTREGAR_MA, recebe: { nome: 'Maria', cpfCnpj: '52998224725' } } as EntregaVenda, longo, 1000), [])
  assert.deepEqual(pendenciasDaEntrega({ modo: 'retira', modalidade: 'SemOcorrenciaDeTransporte' }, longo, 1000), [])
})

test('entregar em outra UF que a do emitente é para outro estado também para contribuinte e ciclomotor da UF da loja', () => {
  assert.deepEqual(operacaoDaVenda({ ...PI_PARA_MA, ufCliente: 'PI', entrega: ENTREGAR_MA, ciclomotor: true, clienteContribuinte: true }),
    { interestadual: true, motivo: 'entregar', ufOrigem: 'PI', ufDestino: 'MA' })
})

test('o endereço da entrega numa linha, para a efetivação: sem complemento vazio e com o CEP formatado', () => {
  assert.equal(enderecoDaEntregaEmLinha(ENTREGAR_MA.endereco), 'Rua de exemplo, 100, Centro, São Luís/MA, CEP 65000-000')
  assert.equal(enderecoDaEntregaEmLinha({ ...ENTREGAR_MA.endereco, complemento: 'Casa 2', cep: '' }), 'Rua de exemplo, 100, Casa 2, Centro, São Luís/MA')
})

test('o resumo diz para onde vai a entrega; sem UF ainda, só "Entregar"', () => {
  assert.equal(textoDaEntrega(ENTREGAR_MA), 'Entregar em São Luís/MA')
  assert.equal(textoDaEntrega({ ...ENTREGAR_MA, endereco: { ...ENTREGAR_MA.endereco, nomeCidade: '', cidade: '', uf: '' } } as EntregaVenda), 'Entregar')
  assert.equal(textoDaEntrega({ ...ENTREGAR_MA, endereco: { ...ENTREGAR_MA.endereco, nomeCidade: '', cidade: '' } } as EntregaVenda), 'Entregar')
  assert.equal(textoDaEntrega({ modo: 'retira', modalidade: '' }), 'Retira na loja')
})

// Frete cobrado (#726, 4b): só na entrega, só com a loja levando ou contratando (decisão do Luis, 07/11/2026).
const COM_FRETE = (modalidade: string, frete: unknown) =>
  conferirEntrega({ modo: 'entregar', modalidade, endereco: LOCAL_MA, recebe: null, frete })

test('frete cobrado com "Loja leva" ou "Loja contrata" grava o valor em reais', () => {
  assert.deepEqual(COM_FRETE('TransporteProprioPorContaDoRemetente', 350),
    { ok: true, entrega: { ...ENTREGAR_MA, frete: 350 } })
  assert.deepEqual(COM_FRETE('ContratacaoPorContaDoRemetente', 99.9),
    { ok: true, entrega: { ...ENTREGAR_MA, modalidade: 'ContratacaoPorContaDoRemetente', frete: 99.9 } })
})

test('sem frete (nulo ou ausente) a Entrega grava sem a chave', () => {
  assert.deepEqual(COM_FRETE('TransporteProprioPorContaDoRemetente', null), { ok: true, entrega: ENTREGAR_MA })
})

test('frete com outra modalidade, zero, negativo, com mais de 2 casas ou que não é número é recusado', () => {
  const soLoja = 'O frete cobrado só vale com "Loja leva com veículo próprio" ou "Loja contrata e paga a transportadora".'
  assert.deepEqual(COM_FRETE('ContratacaoPorContaDoDestinatario', 350), { ok: false, erro: soLoja })
  assert.deepEqual(COM_FRETE('', 350), { ok: false, erro: soLoja })
  for (const frete of [0, -10, 10.555, '350', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(COM_FRETE('TransporteProprioPorContaDoRemetente', frete), { ok: false, erro: 'Valor do frete inválido.' }, String(frete))
  }
})

test('retirada na loja não leva frete, mesmo que o navegador mande', () => {
  assert.deepEqual(conferirEntrega({ modo: 'retira', modalidade: 'TransporteProprioPorContaDoRemetente', frete: 350 }),
    { ok: true, entrega: { modo: 'retira', modalidade: 'TransporteProprioPorContaDoRemetente' } })
})

test('freteDaVenda: o frete gravado, ou zero sem frete, na retirada e em venda antiga', () => {
  assert.equal(freteDaVenda({ ...ENTREGAR_MA, frete: 350 } as EntregaVenda), 350)
  assert.equal(freteDaVenda(ENTREGAR_MA), 0)
  assert.equal(freteDaVenda({ modo: 'retira', modalidade: '' }), 0)
  assert.equal(freteDaVenda(null), 0)
})

test('venda com valor que não cobre o frete (editada depois) não emite', () => {
  const comFrete = { ...ENTREGAR_MA, frete: 350 } as EntregaVenda
  assert.deepEqual(pendenciasDaEntrega(comFrete, 'Cliente', 350),
    ['O valor da venda não cobre o frete cobrado (R$ 350,00). Corrija em Editar venda: o valor da venda inclui o frete.'])
  assert.deepEqual(pendenciasDaEntrega(comFrete, 'Cliente', 350.01), [])
})

test('valorDaMoto e totalComFrete: a mesma conta, em centavos, para a tela, a efetivação e o editar venda', () => {
  assert.equal(totalComFrete(10000.2, 350.1), 10350.3)
  assert.equal(valorDaMoto(10350.3, 350.1), 10000.2)
  assert.equal(totalComFrete(10000, 0), 10000)
  assert.equal(valorDaMoto(10000, 0), 10000)
})

test('motoNaNota: o valor da moto na nota, ou nulo quando o valor da venda não cobre o frete', () => {
  assert.equal(motoNaNota(10350, 350), 10000)
  assert.equal(motoNaNota(350, 350), null)
  assert.equal(motoNaNota(300, 350), null)
  assert.equal(motoNaNota(1000, 0), 1000)
})

// Trava da entrega em outro estado (#848, decisão do Luis 12/11/2026): pedido e NF decidem por aqui.
const ENTREGAR_EM = (uf: string): EntregaVenda => ({
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente', recebe: null,
  endereco: { cep: '', logradouro: 'Rua A', numero: '1', complemento: '', bairro: 'Centro', cidade: '4106902', nomeCidade: 'Curitiba', uf },
})

test('trava da entrega: "Entregar" em UF diferente da do emitente recusa com a frase', () => {
  assert.equal(travaDaEntregaEmOutroEstado(ENTREGAR_EM('PR'), 'MG'), ENTREGA_EM_OUTRO_ESTADO)
  assert.equal(ENTREGA_EM_OUTRO_ESTADO, 'Entrega para outro estado ainda não disponível. Use Retira na loja ou entrega no mesmo estado.')
})

test('trava da entrega: mesma UF (com espaço ou minúscula), retirada e venda sem Entrega passam', () => {
  assert.equal(travaDaEntregaEmOutroEstado(ENTREGAR_EM('MG'), 'MG'), null)
  assert.equal(travaDaEntregaEmOutroEstado(ENTREGAR_EM('mg'), ' mg '), null)
  assert.equal(travaDaEntregaEmOutroEstado({ modo: 'retira', modalidade: '' }, 'MG'), null)
  assert.equal(travaDaEntregaEmOutroEstado(null, 'MG'), null)
})

test('trava da entrega: UF do emitente desconhecida não trava (avise, não bloqueie)', () => {
  assert.equal(travaDaEntregaEmOutroEstado(ENTREGAR_EM('PR'), null), null)
})

// Alterar a Entrega depois da venda (#895): o frete cobrado já entrou no total e nos pagamentos, então não muda.
const ENTREGA_COM_FRETE: EntregaVenda = {
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente',
  endereco: { cep: '65000000', logradouro: 'Rua A', numero: '1', complemento: '', bairro: 'Centro', cidade: '2111300', nomeCidade: 'São Luís', uf: 'MA' },
  recebe: null, frete: 350,
}

test('venda com frete: outro endereço, quem recebe e modalidade com frete passam com o mesmo valor', () => {
  const depois: EntregaVenda = {
    ...ENTREGA_COM_FRETE, modalidade: 'ContratacaoPorContaDoRemetente',
    endereco: { ...ENTREGA_COM_FRETE.endereco, logradouro: 'Rua B' }, recebe: { nome: 'Maria', cpfCnpj: '529.982.247-25' },
  }
  assert.equal(recusaDoFreteDaVendaEfetivada(ENTREGA_COM_FRETE, depois), null)
})

test('venda com frete: virar Retira, perder o frete ou mudar o valor (mesmo em centavos) é recusado', () => {
  for (const depois of [
    { modo: 'retira', modalidade: 'TransporteProprioPorContaDoRemetente' },
    { ...ENTREGA_COM_FRETE, frete: undefined },
    { ...ENTREGA_COM_FRETE, frete: 350.01 },
  ] as EntregaVenda[]) assert.equal(recusaDoFreteDaVendaEfetivada(ENTREGA_COM_FRETE, depois), FRETE_FIXO_NA_VENDA)
})

test('venda sem frete (ou antiga, sem Entrega) não ganha frete; sem frete, muda à vontade', () => {
  const semFrete = { ...ENTREGA_COM_FRETE, frete: undefined }
  assert.equal(recusaDoFreteDaVendaEfetivada(semFrete, ENTREGA_COM_FRETE), SEM_FRETE_NA_VENDA)
  assert.equal(recusaDoFreteDaVendaEfetivada(null, ENTREGA_COM_FRETE), SEM_FRETE_NA_VENDA)
  assert.equal(recusaDoFreteDaVendaEfetivada(null, { modo: 'retira', modalidade: '' }), null)
})

test('o log da alteração guarda modo, UF, modalidade e frete de antes e de depois', () => {
  assert.deepEqual(entregaParaLog(ENTREGA_COM_FRETE), { modo: 'entregar', uf: 'MA', modalidade: 'TransporteProprioPorContaDoRemetente', frete: 350 })
  assert.deepEqual(entregaParaLog({ modo: 'retira', modalidade: '' }), { modo: 'retira', uf: null, modalidade: '', frete: 0 })
  assert.equal(entregaParaLog(null), null)
})

// Trava do Alterar (#895): a mesma regra do "Cancelar venda", com a frase de cada situação da nota viva.
const AGORA = new Date('2026-11-14T15:00:00Z')
const nota = (ambiente: string, status: string, dataAutorizacao: string | null = '2026-11-14T12:00:00Z') => ({ ambiente, status, dataAutorizacao })

test('trava do Alterar: cada nota de produção viva tem a sua orientação', () => {
  assert.equal(travaDaAlteracaoDaEntrega([nota('Producao', 'Autorizada')], AGORA), CANCELE_A_NF_PARA_ALTERAR)
  assert.equal(travaDaAlteracaoDaEntrega([nota('Producao', 'CancelamentoNegado')], AGORA), CANCELE_A_NF_PARA_ALTERAR)
  assert.equal(travaDaAlteracaoDaEntrega([nota('Producao', 'Enviando', null)], AGORA), TRAVA_DO_ALTERAR.emissao_em_andamento)
  assert.equal(travaDaAlteracaoDaEntrega([nota('Producao', 'EmProcessoDeCancelamento')], AGORA), TRAVA_DO_ALTERAR.cancelamento_em_andamento)
  assert.equal(travaDaAlteracaoDaEntrega([nota('Producao', 'Autorizada', '2026-11-12T12:00:00Z')], AGORA), TRAVA_DO_ALTERAR.fora_do_prazo)
  assert.equal(travaDaAlteracaoDaEntrega([nota('Producao', 'Autorizada', null)], AGORA), TRAVA_DO_ALTERAR.sem_data)
})

test('trava do Alterar: homologação, notas mortas e venda sem nota liberam; uma viva entre mortas trava', () => {
  for (const n of [nota('Homologacao', 'Autorizada'), ...['Negada', 'Denegada', 'Cancelada', 'Descartada'].map(s => nota('Producao', s))]) {
    assert.equal(travaDaAlteracaoDaEntrega([n], AGORA), null, `${n.ambiente} ${n.status}`)
  }
  assert.equal(travaDaAlteracaoDaEntrega([], AGORA), null)
  assert.equal(travaDaAlteracaoDaEntrega([nota('Producao', 'Negada'), nota('Producao', 'Autorizada')], AGORA), CANCELE_A_NF_PARA_ALTERAR)
})
