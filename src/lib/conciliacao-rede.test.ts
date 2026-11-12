import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerRelatorioRede, type ResultadoRede } from './conciliacao-rede'
import { CABECALHO_REDE, montarRelatorioRede, parcelaRede, vendaParceladaRede } from '@/test/relatorio-rede-sintetico'

const lido = (r: ResultadoRede) => {
  if (!r.ok) assert.fail(`recusou: ${r.erro}`)
  return r
}

test('venda à vista: uma linha vira uma transação com data da venda, valores, bandeira, cartão e estabelecimento', () => {
  const { transacoes, incompletas } = lido(lerRelatorioRede(montarRelatorioRede([parcelaRede()])))
  assert.equal(incompletas, 0)
  assert.deepEqual(transacoes, [{
    nsu: '2026-11-03:11112222:123456',
    autorizacao: '123456',
    dataTransacao: '2026-11-03',
    valorBruto: 100,
    valorLiquido: 98,
    parcelas: 1,
    tipo: 'credito',
    status: 'aprovado',
    rawData: { bandeira: 'visa', portador: '411111*****1111', serial: '99990000' },
  }])
})

test('parcelado completo: as parcelas viram UMA venda com bruto e líquido somados (1ª parcela com centavos a mais)', () => {
  const linhas = vendaParceladaRede(3, { 'valor bruto da parcela original': '33,33', 'valor líquido da parcela': '32,66' })
  linhas[0] = { ...linhas[0], 'valor bruto da parcela original': '33,34', 'valor líquido da parcela': '32,68' }
  const { transacoes } = lido(lerRelatorioRede(montarRelatorioRede(linhas)))
  assert.equal(transacoes.length, 1)
  assert.equal(transacoes[0].valorBruto, 100)
  assert.equal(transacoes[0].valorLiquido, 98)
  assert.equal(transacoes[0].parcelas, 3)
})

test('parcelado com parcela faltando no arquivo: fica de fora e é contado, nunca valor parcial', () => {
  const completa = vendaParceladaRede(2, { 'NSU/CV': '1' })
  const incompleta = vendaParceladaRede(3, { 'NSU/CV': '2' }).slice(0, 2)
  const r = lido(lerRelatorioRede(montarRelatorioRede([...completa, ...incompleta])))
  assert.deepEqual(r.transacoes.map(t => t.nsu), ['2026-11-03:1:123456'])
  assert.equal(r.incompletas, 1)
})

test('débito: tipo debito, 1 parcela', () => {
  const { transacoes } = lido(lerRelatorioRede(montarRelatorioRede([parcelaRede({ modalidade: 'Débito' })])))
  assert.equal(transacoes[0].tipo, 'debito')
  assert.equal(transacoes[0].parcelas, 1)
})

test('cancelada/contestada ou status diferente de paga: fica de fora', () => {
  const linhas = [
    parcelaRede({ 'NSU/CV': '1', 'cancelamento/contestação': 'cancelamento' }),
    parcelaRede({ 'NSU/CV': '2', status: 'pendente' }),
    parcelaRede({ 'NSU/CV': '3' }),
  ]
  const r = lido(lerRelatorioRede(montarRelatorioRede(linhas)))
  assert.deepEqual(r.transacoes.map(t => t.nsu), ['2026-11-03:3:123456'])
})

test('autorização alfanumérica é guardada como veio', () => {
  const { transacoes } = lido(lerRelatorioRede(montarRelatorioRede([parcelaRede({ 'número da autorização': 'A1B2C3' })])))
  assert.equal(transacoes[0].autorizacao, 'A1B2C3')
})

test('valor com milhar: 2.000,00 vira 2000', () => {
  const { transacoes } = lido(lerRelatorioRede(montarRelatorioRede([parcelaRede({ 'valor bruto da parcela original': '2.000,00', 'valor líquido da parcela': '1.960,00' })])))
  assert.equal(transacoes[0].valorBruto, 2000)
  assert.equal(transacoes[0].valorLiquido, 1960)
})

test('mesmo NSU/CV em dias diferentes são vendas diferentes', () => {
  const linhas = [parcelaRede(), parcelaRede({ 'data original da venda': '04/11/2026' })]
  const { transacoes } = lido(lerRelatorioRede(montarRelatorioRede(linhas)))
  assert.equal(new Set(transacoes.map(t => t.nsu)).size, 2)
})

test('colunas lidas pelo nome: cabeçalho em outra ordem dá o mesmo resultado', () => {
  const normal = lerRelatorioRede(montarRelatorioRede([parcelaRede()]))
  const invertido = lerRelatorioRede(montarRelatorioRede([parcelaRede()], [...CABECALHO_REDE].reverse()))
  assert.equal(normal.ok, true)
  assert.deepEqual(invertido, normal)
})

test('sem o cabeçalho da Rede: recusa', () => {
  const r = lerRelatorioRede('03/11/2026;03/11/2026;100,00\n')
  assert.deepEqual(r, { ok: false, erro: 'Cabeçalho do relatório da Rede não encontrado. Confira se o arquivo é o de pagamentos da Rede.' })
})

test('coluna obrigatória ausente: recusa dizendo qual', () => {
  const r = lerRelatorioRede(montarRelatorioRede([parcelaRede()], CABECALHO_REDE.filter(c => c !== 'NSU/CV')))
  assert.deepEqual(r, { ok: false, erro: 'O relatório da Rede não tem a coluna: NSU/CV.' })
})

test('data ou valor ilegível: recusa com o número da linha, nada é lido', () => {
  const data = lerRelatorioRede(montarRelatorioRede([parcelaRede({ 'NSU/CV': '1' }), parcelaRede({ 'NSU/CV': '2', 'data original da venda': '31/02/2026' })]))
  assert.deepEqual(data, { ok: false, erro: 'Data da venda inválida na linha 3. Nada foi gravado.' })
  const valor = lerRelatorioRede(montarRelatorioRede([parcelaRede({ 'valor líquido da parcela': 'abc' })]))
  assert.deepEqual(valor, { ok: false, erro: 'Valor ilegível na linha 2. Nada foi gravado.' })
})

test('soma do bruto e do líquido das transações bate com o total das linhas do sintético', () => {
  const linhas = [
    ...vendaParceladaRede(12, { 'NSU/CV': '10', 'valor bruto da parcela original': '166,67', 'valor líquido da parcela': '161,67' }),
    ...vendaParceladaRede(2, { 'NSU/CV': '20', 'número da autorização': 'ZX9Y8W', 'valor bruto da parcela original': '1.250,50', 'valor líquido da parcela': '1.225,49' }),
    parcelaRede({ 'NSU/CV': '30', modalidade: 'Débito', 'valor bruto da parcela original': '89,90', 'valor líquido da parcela': '88,99' }),
  ]
  const { transacoes } = lido(lerRelatorioRede(montarRelatorioRede(linhas)))
  const soma = (f: (t: (typeof transacoes)[number]) => number) => Math.round(transacoes.reduce((s, t) => s + f(t), 0) * 100) / 100
  // 12 × 166,67 + 2 × 1.250,50 + 89,90 e 12 × 161,67 + 2 × 1.225,49 + 88,99
  assert.equal(soma(t => t.valorBruto), 4590.94)
  assert.equal(soma(t => t.valorLiquido), 4479.01)
  assert.deepEqual(transacoes.map(t => t.parcelas), [12, 2, 1])
})
