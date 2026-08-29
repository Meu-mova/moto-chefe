import test from 'node:test'
import assert from 'node:assert'
import {
  INICIO_REGRA_DOCUMENTOS,
  pendenciasDaVenda,
  vendaEfetivada,
  type VendaDocumentos,
} from './pendencias-venda'

const COMPLETA: VendaDocumentos = {
  contratoAssinado: true,
  checklistAssinado: true,
  notaFiscalSaida: '12345',
  nfLiberadaEm: null,
  statusConciliacao: 'conciliada',
}

test('a regra vale a partir de 12/08/2026, quando contrato e checklist entraram no ar', () => {
  assert.equal(INICIO_REGRA_DOCUMENTOS, '2026-08-12')
})

test('venda com contrato, checklist, NF e conciliação fechada está efetivada', () => {
  assert.deepEqual(pendenciasDaVenda(COMPLETA), [])
  assert.equal(vendaEfetivada(COMPLETA), true)
})

test('sem contrato assinado vira pendência de contrato', () => {
  const v = { ...COMPLETA, contratoAssinado: false }
  assert.deepEqual(pendenciasDaVenda(v), ['contrato'])
  assert.equal(vendaEfetivada(v), false)
})

test('sem checklist assinado vira pendência de checklist', () => {
  assert.deepEqual(pendenciasDaVenda({ ...COMPLETA, checklistAssinado: false }), ['checklist'])
})

test('sem nota fiscal de saída vira pendência de NF', () => {
  assert.deepEqual(pendenciasDaVenda({ ...COMPLETA, notaFiscalSaida: null }), ['nf'])
})

test('conciliação pendente e parcial contam como pendência', () => {
  assert.deepEqual(pendenciasDaVenda({ ...COMPLETA, statusConciliacao: 'pendente' }), ['conciliacao'])
  assert.deepEqual(pendenciasDaVenda({ ...COMPLETA, statusConciliacao: 'parcial' }), ['conciliacao'])
})

test('venda sem nada a conciliar (dinheiro/financiamento) não é pendência', () => {
  assert.deepEqual(pendenciasDaVenda({ ...COMPLETA, statusConciliacao: 'na' }), [])
})

test('as pendências saem na ordem em que o vendedor resolve: contrato, checklist, NF, conciliação', () => {
  const v: VendaDocumentos = {
    contratoAssinado: false,
    checklistAssinado: false,
    notaFiscalSaida: null,
    nfLiberadaEm: null,
    statusConciliacao: 'pendente',
  }
  assert.deepEqual(pendenciasDaVenda(v), ['contrato', 'checklist', 'nf', 'conciliacao'])
})

test('NF liberada por exceção dispensa contrato, checklist e NF', () => {
  const v: VendaDocumentos = {
    contratoAssinado: false,
    checklistAssinado: false,
    notaFiscalSaida: null,
    nfLiberadaEm: new Date('2026-08-12T12:00:00Z'),
    statusConciliacao: 'conciliada',
  }
  assert.deepEqual(pendenciasDaVenda(v), [])
  assert.equal(vendaEfetivada(v), true)
})

test('NF liberada não dispensa a conciliação — dinheiro que não entrou continua pendente', () => {
  const v: VendaDocumentos = {
    contratoAssinado: false,
    checklistAssinado: false,
    notaFiscalSaida: null,
    nfLiberadaEm: new Date('2026-08-12T12:00:00Z'),
    statusConciliacao: 'parcial',
  }
  assert.deepEqual(pendenciasDaVenda(v), ['conciliacao'])
  assert.equal(vendaEfetivada(v), false)
})
