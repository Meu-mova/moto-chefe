import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reconstruirLinhas, lerHolerite, nomeConfere, type ItemTexto } from './holerite-pdf'

// As linhas abaixo são a estrutura real do holerite da contabilidade, com nomes
// e valores trocados: salário de gente de verdade não fica versionado no repo.

const RECIBO_SALARIO = [
  'ECOMOV MOBILIDADE - SERVICOS - CIDADE LTDA',
  'CNPJ: 11.222.333/0001-44 CC: GERAL Folha Mensal',
  'Mensalista Agosto de 2026',
  'Código Nome do Funcionário CBO Departamento Filial',
  '2 FULANO SOUZA GOMES 521110 1 1',
  'CONSULTOR DE VENDAS Admissão: 29/10/2025',
  'Código Descrição Referência Vencimentos Descontos',
  '8781 DIAS NORMAIS 30,00 1.880,00',
  '998 I.N.S.S 7,97 187,97',
  'Total de Vencimentos Total de Descontos',
  '2.358,87 939,97',
  'Valor Líquido 1.418,90',
]

// No adiantamento o layout encosta os dois totais no rótulo do líquido.
const RECIBO_ADIANTAMENTO = [
  'MOTOCHEFE CIDADE LTDA CC: GERAL Adiantamento',
  'CNPJ: 55.666.777/0001-88 Mensalista Agosto de 2026',
  'Código Nome do Funcionário CBO Departamento Filial',
  '5 BELTRANA CAMARGO AQUILES 521110 1 1',
  '980 ADIANTAMENTO SALARIAL. 40,00 752,00',
  'Total de Vencimentos Total de Descontos',
  'Valor Líquido 752,00 185,21',
]

test('lê nome, competência e líquido do recibo de salário', () => {
  const r = lerHolerite(RECIBO_SALARIO)
  assert.equal(r.nome, 'FULANO SOUZA GOMES')
  assert.equal(r.competencia, '2026-08')
  assert.equal(r.liquido, 1418.9)
})

test('no adiantamento o líquido é vencimentos menos descontos, não o bruto', () => {
  const r = lerHolerite(RECIBO_ADIANTAMENTO)
  assert.equal(r.nome, 'BELTRANA CAMARGO AQUILES')
  assert.equal(r.liquido, 566.79)   // 752,00 - 185,21, e não 752,00
})

// A competência é o mês do TRABALHO. O arquivo que a contabilidade manda se
// chama "2026-09" porque é quando pagou — confiar no nome erraria o mês inteiro.
test('a competência sai do texto, em YYYY-MM', () => {
  assert.equal(lerHolerite(['Mensalista Dezembro de 2025']).competencia, '2025-12')
  assert.equal(lerHolerite(['Mensalista Março de 2026']).competencia, '2026-03')
})

test('cada campo falha sozinho quando o layout não bate', () => {
  const r = lerHolerite(['papel em branco', 'sem nada aqui'])
  assert.equal(r.nome, null)
  assert.equal(r.competencia, null)
  assert.equal(r.liquido, null)
})

test('rótulo de líquido sem número não inventa valor', () => {
  const r = lerHolerite(['Total de Vencimentos Total de Descontos', 'Valor Líquido'])
  assert.equal(r.liquido, null)
})

test('linha de nome sem nome nenhum devolve null', () => {
  assert.equal(lerHolerite(['Nome do Funcionário CBO', '3 521110 1 1']).nome, null)
})

// ─── reconstrução das linhas a partir das coordenadas ────────────────────────

const item = (x: number, y: number, texto: string): ItemTexto => ({ x, y, texto })

test('remonta a linha na ordem de leitura, de cima para baixo e da esquerda para a direita', () => {
  // Fora de ordem de propósito: é assim que o PDF entrega.
  const linhas = reconstruirLinhas([
    item(300, 700, 'MUNDO'),
    item(100, 500, 'segunda'),
    item(100, 700, 'OLA'),
  ])
  assert.deepEqual(linhas, ['OLA MUNDO', 'segunda'])
})

// O agrupamento é por proximidade e não por Y arredondado: arredondar corta em
// pontos fixos e separa dois pedaços que caem em lados opostos do corte — foi o
// que fez o rótulo "Valor Líquido" perder o número dele numa das páginas.
test('pedaços quase na mesma altura contam como uma linha só', () => {
  const linhas = reconstruirLinhas([
    item(100, 700.0, 'Valor Líquido'),
    item(400, 698.4, '1.418,90'),
  ])
  assert.deepEqual(linhas, ['Valor Líquido 1.418,90'])
})

test('pedaços em alturas diferentes não se misturam', () => {
  const linhas = reconstruirLinhas([
    item(100, 700, 'de cima'),
    item(100, 680, 'de baixo'),
  ])
  assert.deepEqual(linhas, ['de cima', 'de baixo'])
})

test('pedaço vazio não vira linha', () => {
  assert.deepEqual(reconstruirLinhas([item(1, 1, '   '), item(2, 1, 'a')]), ['a'])
  assert.deepEqual(reconstruirLinhas([]), [])
})

// ─── conferência do nome ─────────────────────────────────────────────────────

test('o cadastro pode ter menos nomes que o papel', () => {
  assert.equal(nomeConfere('Anne Ester', 'ANNE ESTER SILVA DIAS'), true)
  assert.equal(nomeConfere('anne ester silva dias', 'ANNE ESTER SILVA DIAS'), true)
})

test('acento e caixa não reprovam', () => {
  assert.equal(nomeConfere('Márcio Antônio', 'MARCIO ANTONIO DA SILVA'), true)
})

test('holerite de outra pessoa é recusado', () => {
  assert.equal(nomeConfere('Murilo Belo Vieira Gomes', 'BRENDA CAMARGO AQUILES'), false)
})

// Substring aprovaria: "ANA" está dentro de "ANALICE". Por isso a comparação é
// por palavra inteira.
test('nome não casa por pedaço de outra palavra', () => {
  assert.equal(nomeConfere('Ana Souza', 'ANALICE SOUZA'), false)
})

test('preposição não conta como nome', () => {
  // Só "de/da" em comum não pode aprovar ninguém.
  assert.equal(nomeConfere('Joao de Souza', 'MARIA DA SILVA'), false)
})

test('cadastro sem nenhuma palavra utilizável não aprova', () => {
  assert.equal(nomeConfere('de', 'QUALQUER UM'), false)
  assert.equal(nomeConfere('', 'QUALQUER UM'), false)
})
