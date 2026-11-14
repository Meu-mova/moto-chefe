import { test } from 'node:test'
import assert from 'node:assert/strict'
import { STATUS_TRANSFERENCIA, comprovanteDaTransferencia, rotuloStatusTransferencia, type TransferenciaParaComprovante } from './transferencia-tela'

// Horários em UTC; o comprovante mostra Brasília (UTC-3).
const aceita: TransferenciaParaComprovante = {
  status: 'aceita',
  dataSolicitacao: new Date('2026-11-13T12:12:00.000Z'),
  dataResposta: new Date('2026-11-13T13:40:00.000Z'),
  observacao: 'Levar com carregador.',
  modelo: 'JETMAX',
  cor: 'CINZA',
  chassi: 'LYDAE0000T0000001',
  motor: 'MOTOR0000000001',
  lojaOrigemNome: 'Loja Centro',
  lojaDestinoNome: 'Loja Norte',
  solicitadoPorNome: 'Ana Exemplo',
  respondidoPorNome: 'Bruno Exemplo',
  empresaNome: 'Grupo Exemplo',
  empresaRazaoSocial: 'Empresa Exemplo Ltda',
  empresaCnpj: '00000000000100',
}

test('transferência aceita: empresa, data, status, moto, origem e destino, quem pediu e quem aprovou', () => {
  assert.deepEqual(comprovanteDaTransferencia(aceita), {
    empresa: 'Empresa Exemplo Ltda',
    cnpj: '00.000.000/0001-00',
    data: '13/11/2026',
    status: 'Aceita',
    moto: 'JETMAX · CINZA · chassi LYDAE0000T0000001 · motor MOTOR0000000001',
    origem: 'Loja Centro',
    destino: 'Loja Norte',
    solicitado: 'Ana Exemplo · 13/11/2026 09:12',
    resposta: { rotulo: 'Aprovado por', texto: 'Bruno Exemplo · 13/11/2026 10:40' },
    observacao: 'Levar com carregador.',
  })
})

test('recusada: a resposta diz "Recusado por"', () => {
  const c = comprovanteDaTransferencia({ ...aceita, status: 'recusada' })
  assert.equal(c.status, 'Recusada')
  assert.deepEqual(c.resposta, { rotulo: 'Recusado por', texto: 'Bruno Exemplo · 13/11/2026 10:40' })
})

test('pendente: sem linha de resposta', () => {
  const c = comprovanteDaTransferencia({ ...aceita, status: 'pendente', respondidoPorNome: null, dataResposta: null })
  assert.equal(c.status, 'Pendente')
  assert.equal(c.resposta, null)
})

test('sem motor, sem observação e sem razão social: o motor some, a observação fica nula e vale o nome do grupo', () => {
  const c = comprovanteDaTransferencia({ ...aceita, motor: null, observacao: '  ', empresaRazaoSocial: null })
  assert.equal(c.moto, 'JETMAX · CINZA · chassi LYDAE0000T0000001')
  assert.equal(c.observacao, null)
  assert.equal(c.empresa, 'Grupo Exemplo')
})

test('a data do cabeçalho é o dia da solicitação em Brasília: 01:30 UTC de 14/11 ainda é 13/11', () => {
  const c = comprovanteDaTransferencia({ ...aceita, dataSolicitacao: new Date('2026-11-14T01:30:00.000Z') })
  assert.equal(c.data, '13/11/2026')
  assert.equal(c.solicitado, 'Ana Exemplo · 13/11/2026 22:30')
})

test('lista única de status: valor e rótulo', () => {
  assert.deepEqual(STATUS_TRANSFERENCIA.map(s => [s.value, s.label]), [['pendente', 'Pendente'], ['aceita', 'Aceita'], ['recusada', 'Recusada']])
  assert.equal(rotuloStatusTransferencia('aceita'), 'Aceita')
  assert.equal(rotuloStatusTransferencia('desconhecido'), 'desconhecido')
})
