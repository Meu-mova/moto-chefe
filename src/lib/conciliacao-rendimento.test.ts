import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerRelatorioRendimento, type ResultadoRendimento } from './conciliacao-rendimento'
import { CABECALHO_RENDIMENTO, montarRelatorioRendimento, operacaoRendimento } from '@/test/relatorio-rendimento-sintetico'

const lido = (r: ResultadoRendimento) => {
  if (!r.ok) assert.fail(`recusou: ${r.erro}`)
  return r.transacoes
}
const recusa = (r: ResultadoRendimento) => {
  if (r.ok) assert.fail('devia recusar o arquivo')
  return r.erro
}
const ler = (...linhas: Parameters<typeof operacaoRendimento>[0][]) =>
  lerRelatorioRendimento(montarRelatorioRendimento(linhas.map(operacaoRendimento)))

test('operação paga: Código vira a chave, Cód. Venda a autorização, o dia do pagamento a data e a Conta trava o grupo', () => {
  assert.deepEqual(lido(ler({ 'Portador do Cartão': 'PORTADOR SINTETICO' })), [{
    nsu: '10000001',
    autorizacao: 'A1B2C3',
    dataTransacao: '2026-11-03',
    valorBruto: 3990,
    valorLiquido: 3830.4,
    parcelas: 2,
    tipo: 'credito',
    status: 'aprovado',
    rawData: { bandeira: 'visa', portador: 'PORTADOR SINTETICO', serial: '99999-9' },
  }])
})

test('sem tipo no arquivo: 0 ou 1 parcela é débito com 1 parcela; 2 ou mais é crédito', () => {
  const transacoes = lido(ler(
    { 'Código': '1', 'Parcelas': '0' },
    { 'Código': '2', 'Parcelas': '1' },
    { 'Código': '3', 'Parcelas': '2' },
    { 'Código': '4', 'Parcelas': '12' },
  ))
  assert.deepEqual(transacoes.map(t => [t.parcelas, t.tipo]),
    [[1, 'debito'], [1, 'debito'], [2, 'credito'], [12, 'credito']])
})

test('só entra o que tem Status Pago; o resto fica de fora sem recusar o arquivo', () => {
  const transacoes = lido(ler(
    { 'Código': '1', 'Status': 'Cancelado' },
    { 'Código': '2', 'Status': 'Pendente' },
    { 'Código': '3' },
  ))
  assert.deepEqual(transacoes.map(t => t.nsu), ['3'])
})

test('portador e Cód. Venda vazios viram null e sem autorização', () => {
  const [t] = lido(ler({ 'Cód. Venda': '' }))
  assert.equal(t.autorizacao, undefined)
  assert.equal(t.rawData.portador, null)
})

test('linha paga com data, valor ou Código ruim recusa o arquivo inteiro e diz a linha', () => {
  assert.match(recusa(ler({ 'Código': '1' }, { 'Código': '2', 'Data Pagamento': '31/02/2026 10:00:00' })), /Data.*linha 3/)
  assert.match(recusa(ler({ 'Valor Total a Pagar': 'R$ abc' })), /Valor ilegível na linha 2/)
  assert.match(recusa(ler({ 'Código': '' })), /Código vazio na linha 2/)
})

test('Parcelas que não é número inteiro (negativo, fração, texto, vazio) recusa o arquivo e diz a linha', () => {
  for (const parcelas of ['-3', '2.5', '2,5', 'x', '']) {
    assert.equal(recusa(ler({ 'Parcelas': parcelas })), 'Parcelas inválidas na linha 2. Nada foi gravado.', `Parcelas = "${parcelas}"`)
  }
})

test('cabeçalho: coluna faltando é dita pelo nome; arquivo de outro formato não é aceito como Rendimento', () => {
  const semLiquido = CABECALHO_RENDIMENTO.filter(c => c !== 'Valor Total a Pagar')
  assert.equal(recusa(lerRelatorioRendimento(montarRelatorioRendimento([operacaoRendimento()], semLiquido))),
    'O relatório da Rendimento não tem a coluna: Valor Total a Pagar.')
  assert.match(recusa(lerRelatorioRendimento('coluna a;coluna b\r\n1;2')), /Cabeçalho do relatório da Rendimento não encontrado/)
})

test('acento mal decodificado no cabeçalho não derruba a leitura', () => {
  const texto = montarRelatorioRendimento([operacaoRendimento()]).replace(/[óçãé]/g, '�')
  assert.equal(lido(lerRelatorioRendimento(texto)).length, 1)
})
