import { test } from 'node:test'
import assert from 'node:assert/strict'
import { desdeDoSync, selecionarSumidas, dividirEmLotes, dataAposSync, urlDespesasSemSync } from './sync-incremental'

const PADRAO = new Date('2025-01-01T00:00:00.000Z')

test('desdeDoSync: sem sync anterior usa o padrão (histórico completo)', () => {
  assert.equal(desdeDoSync(null, 30, PADRAO).toISOString(), PADRAO.toISOString())
})

test('desdeDoSync: sync recente volta a margem em dias', () => {
  const ultima = new Date('2026-10-14T15:00:00.000Z')
  assert.equal(desdeDoSync(ultima, 30, PADRAO).toISOString(), '2026-09-14T15:00:00.000Z')
})

test('desdeDoSync: sync muito antigo não passa do padrão', () => {
  const ultima = new Date('2025-01-10T00:00:00.000Z')
  assert.equal(desdeDoSync(ultima, 30, PADRAO).toISOString(), PADRAO.toISOString())
})

type Linha = { id: string; transacaoId: string; data: Date }
const linha = (id: string, transacaoId: string, data: string): Linha => ({ id, transacaoId, data: new Date(data) })

test('selecionarSumidas: fica só o que não veio no extrato e é a partir de `desde`', () => {
  const desde = new Date('2026-09-14T00:00:00.000Z')
  const vizinhas = [
    linha('a', 'ta', '2026-09-20T12:00:00Z'), // não veio no extrato, dentro da janela
    linha('b', 'tb', '2026-09-20T12:00:00Z'), // veio no extrato
    linha('c', 'tc', '2026-09-20T12:00:00Z'), // recém-inserida
  ]
  const sumidas = selecionarSumidas(vizinhas, new Set(['c']), new Set(['tb', 'tc']), desde)
  assert.deepEqual(sumidas.map(s => s.id), ['a'])
})

test('selecionarSumidas: linha anterior a `desde` não é "sumida" só porque o extrato não a pediu', () => {
  const desde = new Date('2026-09-14T00:00:00.000Z')
  const antesDaBorda = linha('velha', 'tv', '2026-09-13T23:00:00Z')
  assert.deepEqual(selecionarSumidas([antesDaBorda], new Set(), new Set(), desde), [])
})

test('selecionarSumidas: a própria borda entra', () => {
  const desde = new Date('2026-09-14T00:00:00.000Z')
  const naBorda = linha('borda', 'tb', '2026-09-14T00:00:00Z')
  assert.deepEqual(selecionarSumidas([naBorda], new Set(), new Set(), desde).map(s => s.id), ['borda'])
})

test('dataAposSync: sem conta pulada grava a data do sync; com qualquer conta pulada não grava', () => {
  const agora = new Date('2026-10-14T12:00:00.000Z')
  assert.equal(dataAposSync(agora, []), agora)
  assert.equal(dataAposSync(agora, ['Stone']), null)
  assert.equal(dataAposSync(agora, ['Stone', 'Sicoob']), null)
})

test('conta pulada num sync não perde a lacuna mesmo se o próximo sync vier depois da margem', () => {
  // Cenário: último sync bom em 01/08. Em 20/09 (50 dias depois) a Stone não responde. Uma saída da Stone
  // de 10/08 (41 dias antes de 20/09) nunca foi lida por ninguém. O sync seguinte, em 21/09, precisa pedi-la.
  const padrao = new Date('2025-01-01T00:00:00.000Z')
  const ultimoBom = new Date('2026-08-01T12:00:00.000Z')
  const quandoFalhou = new Date('2026-09-20T12:00:00.000Z')
  const saidaPerdida = new Date('2026-08-10T12:00:00.000Z')

  const gravada = dataAposSync(quandoFalhou, ['Stone']) ?? ultimoBom // null = continua a data antiga
  assert.ok(desdeDoSync(gravada, 30, padrao) <= saidaPerdida, 'o próximo sync deve alcançar a saída perdida')

  // Contraste: se a data tivesse avançado (sync sem conta pulada), a saída ficaria para trás da margem.
  const seTivesseAvancado = dataAposSync(quandoFalhou, []) as Date
  assert.ok(desdeDoSync(seTivesseAvancado, 30, padrao) > saidaPerdida)
})

test('urlDespesasSemSync: tira só o sync e mantém os outros filtros', () => {
  assert.equal(
    urlDespesasSemSync({ sync: 'completo', mes: '2026-10', sfrom: '2026-10-01', sto: '2026-10-14' }),
    '/despesas?mes=2026-10&sfrom=2026-10-01&sto=2026-10-14',
  )
})

test('urlDespesasSemSync: sem outros parâmetros volta para /despesas puro; parâmetro indefinido some', () => {
  assert.equal(urlDespesasSemSync({ sync: 'completo' }), '/despesas')
  assert.equal(urlDespesasSemSync({ sync: 'completo', mes: undefined }), '/despesas')
})

test('urlDespesasSemSync: valor com caracteres especiais volta igual ao ler a URL', () => {
  const url = urlDespesasSemSync({ sync: 'completo', q: 'a b&c=d' })
  assert.equal(new URL(url, 'http://x').searchParams.get('q'), 'a b&c=d')
  assert.equal(new URL(url, 'http://x').searchParams.has('sync'), false)
})

test('dividirEmLotes: vazio, 1 item, exatamente 1 lote, lote + 1', () => {
  assert.deepEqual(dividirEmLotes([], 3), [])
  assert.deepEqual(dividirEmLotes([1], 3), [[1]])
  assert.deepEqual(dividirEmLotes([1, 2, 3], 3), [[1, 2, 3]])
  assert.deepEqual(dividirEmLotes([1, 2, 3, 4], 3), [[1, 2, 3], [4]])
})

test('dividirEmLotes: tamanho inválido lança erro', () => {
  assert.throws(() => dividirEmLotes([1], 0))
})
