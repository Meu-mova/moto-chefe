import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerRelatorioCielo } from './conciliacao-cielo'
import { CABECALHO_CIELO, montarRelatorioCielo, vendaCielo } from '@/test/relatorio-cielo-sintetico'

function ler(texto: string) {
  const r = lerRelatorioCielo(texto)
  if (!r.ok) assert.fail(r.erro)
  return r
}
const recusa = (texto: string) => {
  const r = lerRelatorioCielo(texto)
  if (r.ok) assert.fail('devia recusar o arquivo')
  return r.erro
}

test('capa, filtros e totalizador não viram transação; só as vendas depois do cabeçalho', () => {
  const r = ler(montarRelatorioCielo({ linhas: [vendaCielo(), vendaCielo({ 'Código da venda': '1000000000000000002' })] }))
  assert.equal(r.transacoes.length, 2)
  assert.equal(r.semCodigo, 0)
})

test('crédito à vista: tipo crédito, 1 parcela, bandeira em minúscula, portador mascarado', () => {
  const [t] = ler(montarRelatorioCielo({ linhas: [vendaCielo()] })).transacoes
  assert.equal(t.tipo, 'credito')
  assert.equal(t.parcelas, 1)
  assert.equal(t.dataTransacao, '2026-11-03')
  assert.equal(t.status, 'aprovado')
  assert.deepEqual(t.rawData, { bandeira: 'visa', portador: '411111 **** 1111', serial: '12345678' })
})

test('crédito parcelado lê as parcelas do "02x" e do "12x"', () => {
  const r = ler(montarRelatorioCielo({ linhas: [
    vendaCielo({ 'Forma de pagamento': 'Crédito parcelado loja 02x', 'Código da venda': '1000000000000000002' }),
    vendaCielo({ 'Forma de pagamento': 'Crédito parcelado loja 12x', 'Código da venda': '1000000000000000003' }),
  ] }))
  assert.deepEqual(r.transacoes.map(t => [t.tipo, t.parcelas]), [['credito', 2], ['credito', 12]])
})

test('débito: tipo débito, 1 parcela', () => {
  const [t] = ler(montarRelatorioCielo({ linhas: [vendaCielo({ 'Forma de pagamento': 'Débito' })] })).transacoes
  assert.equal(t.tipo, 'debito')
  assert.equal(t.parcelas, 1)
})

test('venda que não está Aprovada fica fora', () => {
  const r = ler(montarRelatorioCielo({ linhas: [
    vendaCielo({ 'Status da venda': 'Negada', 'Código da venda': '1000000000000000002' }),
    vendaCielo({ 'Status da venda': 'Cancelada', 'Código da venda': '1000000000000000003' }),
    vendaCielo({ 'Código da venda': '1000000000000000004' }),
  ] }))
  assert.deepEqual(r.transacoes.map(t => t.nsu), ['1000000000000000004'])
})

test('Pix e outras formas que não são cartão ficam fora, mesmo Aprovadas', () => {
  const r = ler(montarRelatorioCielo({ linhas: [
    vendaCielo({ 'Forma de pagamento': 'Pix', 'ID Pix': 'E000000000000000000000000000000000', 'Código da venda': '1000000000000000002' }),
    vendaCielo(),
  ] }))
  assert.equal(r.transacoes.length, 1)
  assert.equal(r.transacoes[0].nsu, '1000000000000000001')
})

test('autorização 000000 vira ausente; a verdadeira se mantém', () => {
  const r = ler(montarRelatorioCielo({ linhas: [
    vendaCielo({ 'Código de autorização': '000000' }),
    vendaCielo({ 'Código da venda': '1000000000000000002' }),
  ] }))
  assert.deepEqual(r.transacoes.map(t => t.autorizacao), [undefined, '123456'])
})

test('o nsu gravado é o Código da venda; NSU/DOC repetido não junta vendas diferentes', () => {
  const r = ler(montarRelatorioCielo({ linhas: [
    vendaCielo({ 'NSU/DOC': '000111', 'Código da venda': '1000000000000000001' }),
    vendaCielo({ 'NSU/DOC': '000111', 'Código da venda': '1000000000000000002' }),
  ] }))
  assert.deepEqual(r.transacoes.map(t => t.nsu), ['1000000000000000001', '1000000000000000002'])
})

test('Número da máquina vira o serial; vazio (venda online) fica sem serial', () => {
  const r = ler(montarRelatorioCielo({ linhas: [
    vendaCielo(),
    vendaCielo({ 'Número da máquina': '', 'Código da venda': '1000000000000000002' }),
  ] }))
  assert.deepEqual(r.transacoes.map(t => t.rawData?.serial), ['12345678', null])
})

test('valor em "R$ 1.234,56": bruto e líquido nas colunas certas, a taxa não vira líquido', () => {
  const [t] = ler(montarRelatorioCielo({ linhas: [
    vendaCielo({ 'Valor bruto': 'R$ 1.234,56', 'Valor Taxa/Tarifa': '-R$ 23,45', 'Valor líquido': 'R$ 1.211,11' }),
  ] })).transacoes
  assert.equal(t.valorBruto, 1234.56)
  assert.equal(t.valorLiquido, 1211.11)
})

test('sem a linha de cabeçalho, recusa em vez de importar zero linhas', () => {
  assert.match(recusa(montarRelatorioCielo({ linhas: [vendaCielo()], comCabecalho: false })), /cabeçalho/i)
})

test('cabeçalho com acento mal decodificado ainda acha as colunas', () => {
  const quebrado = CABECALHO_CIELO.map(n => n.replace(/[áéíóúãçê]/g, '\uFFFD'))
  const texto = montarRelatorioCielo({ linhas: [vendaCielo({ 'Forma de pagamento': 'Cr\uFFFDdito parcelado loja 03x' })] })
    .replace(CABECALHO_CIELO.join(';'), quebrado.join(';'))
  const [t] = ler(texto).transacoes
  assert.equal(t.parcelas, 3)
  assert.equal(t.nsu, '1000000000000000001')
})

// Valores escritos à mão: 100,00 + 250,50 + 49,50 = 400,00 bruto; líquido 98,00 + 245,00 + 48,50 = 391,50.
test('a soma das linhas bate com o totalizador do próprio relatório', () => {
  const texto = montarRelatorioCielo({
    totalizador: ['3', 'R$ 400,00', '-R$ 8,50', 'R$ 391,50'],
    linhas: [
      vendaCielo(),
      vendaCielo({ 'Valor bruto': 'R$ 250,50', 'Valor líquido': 'R$ 245,00', 'Código da venda': '1000000000000000002' }),
      vendaCielo({ 'Valor bruto': 'R$ 49,50', 'Valor líquido': 'R$ 48,50', 'Código da venda': '1000000000000000003' }),
    ],
  })
  const { transacoes } = ler(texto)
  const centavos = (n: number) => Math.round(n * 100)
  assert.equal(centavos(transacoes.reduce((s, t) => s + t.valorBruto, 0)), 40000)
  assert.equal(centavos(transacoes.reduce((s, t) => s + (t.valorLiquido ?? 0), 0)), 39150)
})

test('coluna obrigatória ausente: recusa dizendo qual', () => {
  const semCodigo = CABECALHO_CIELO.filter(n => n !== 'Código da venda')
  assert.match(recusa(montarRelatorioCielo({ linhas: [vendaCielo()], cabecalho: semCodigo })), /Código da venda/)
})

test('data inválida: recusa dizendo a linha do arquivo', () => {
  for (const data of ['31/02/2026', 'xx/yy/zzzz', '']) {
    assert.match(recusa(montarRelatorioCielo({ linhas: [vendaCielo({ 'Data da venda': data })] })), /linha 13/, data)
  }
})

test('valor ilegível: recusa dizendo a linha, em vez de gravar 0', () => {
  assert.match(recusa(montarRelatorioCielo({ linhas: [vendaCielo({ 'Valor bruto': 'abc' })] })), /linha 13/)
  assert.match(recusa(montarRelatorioCielo({ linhas: [vendaCielo({ 'Valor líquido': '' })] })), /linha 13/)
})

test('colunas fora de ordem: lê pelo nome do cabeçalho', () => {
  const invertido = [...CABECALHO_CIELO].reverse()
  const [t] = ler(montarRelatorioCielo({ linhas: [vendaCielo({ 'Valor bruto': 'R$ 77,00', 'Valor líquido': 'R$ 70,00' })], cabecalho: invertido })).transacoes
  assert.equal(t.valorBruto, 77)
  assert.equal(t.valorLiquido, 70)
  assert.equal(t.rawData?.serial, '12345678')
})

test('venda sem Código da venda não é importada e é contada', () => {
  const r = ler(montarRelatorioCielo({ linhas: [
    vendaCielo(),
    vendaCielo({ 'Código da venda': '' }),
    vendaCielo({ 'Código da venda': '1000000000000000003' }),
  ] }))
  assert.equal(r.transacoes.length, 2)
  assert.equal(r.semCodigo, 1)
})
