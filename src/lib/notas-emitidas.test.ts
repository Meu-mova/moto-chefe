import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classificarNota, linkDaVenda, nomeDoArquivo, notasDoLote, periodoEmissao, selecaoDaPagina } from './notas-emitidas'

test('classificarNota agrupa os status da Nota Gateway nos filtros da tela', () => {
  assert.equal(classificarNota('Autorizada'), 'autorizada')
  assert.equal(classificarNota('CancelamentoNegado'), 'autorizada', 'cancelamento recusado: a nota continua valendo')
  assert.equal(classificarNota('Cancelada'), 'cancelada')
  assert.equal(classificarNota('Negada'), 'recusada')
  assert.equal(classificarNota('Denegada'), 'recusada')
  assert.equal(classificarNota('Descartada'), 'descartada')
  assert.equal(classificarNota('Enviando'), 'em_andamento')
  assert.equal(classificarNota('Processando'), 'em_andamento')
  assert.equal(classificarNota('SolicitandoCancelamento'), 'em_andamento')
  assert.equal(classificarNota('StatusQueAApiAindaVaiInventar'), 'em_andamento')
})

test('linkDaVenda abre Vendas filtrada pelo chassi, a partir do dia da venda em Brasília', () => {
  // 22h30 de 31/10 em Brasília = 01h30 de 01/11 em UTC.
  assert.equal(linkDaVenda({ chassi: 'LXY123', dataVenda: '2026-11-01T01:30:00.000Z' }), '/vendas?q=LXY123&de=2026-10-31')
  assert.equal(linkDaVenda({ chassi: null, dataVenda: null }), null, 'nota sem venda (venda cancelada, #347)')
})

test('periodoEmissao: padrão é o mês corrente em Brasília; data inválida volta ao padrão', () => {
  // 22h de 31/10 em Brasília (01h de 01/11 em UTC): ainda é outubro aqui.
  const agora = new Date('2026-11-01T01:00:00.000Z')
  assert.deepEqual(periodoEmissao({}, agora), { de: '2026-10-01', ate: '2026-10-31' })
  assert.deepEqual(periodoEmissao({ de: '2026-09-15', ate: '2026-09-20' }, agora), { de: '2026-09-15', ate: '2026-09-20' })
  assert.deepEqual(periodoEmissao({ de: '2026-02-30', ate: 'lixo' }, agora), { de: '2026-10-01', ate: '2026-10-31' })
})

test('nomeDoArquivo identifica a nota pelo número e pela série, e cai no id quando ainda não há número', () => {
  assert.equal(nomeDoArquivo({ id: 'a1b2', numero: '4512', serie: '1' }, 'xml'), 'NF-4512-serie-1.xml')
  assert.equal(nomeDoArquivo({ id: 'a1b2', numero: '4512', serie: null }, 'pdf'), 'NF-4512.pdf')
  assert.equal(nomeDoArquivo({ id: 'a1b2', numero: null, serie: '1' }, 'pdf'), 'NF-sem-numero-a1b2.pdf')
})

const nota = (id: string, categoria: 'autorizada' | 'cancelada' | 'recusada' | 'em_andamento' | 'descartada') => ({ id, categoria })
const lista = [nota('1', 'autorizada'), nota('2', 'cancelada'), nota('3', 'recusada'), nota('4', 'descartada'), nota('5', 'em_andamento')]

test('notasDoLote sem seleção leva as notas do filtro da tela', () => {
  assert.deepEqual(notasDoLote(lista, { situacao: 'autorizada', ids: [] }).map(n => n.id), ['1'])
  assert.deepEqual(notasDoLote(lista, { situacao: 'todas', ids: [] }).map(n => n.id), ['1', '2'])
})

test('notasDoLote só leva nota com documento válido: recusada, em andamento e descartada ficam fora', () => {
  assert.deepEqual(notasDoLote(lista, { situacao: 'recusada', ids: [] }), [])
  assert.deepEqual(notasDoLote(lista, { situacao: 'em_andamento', ids: [] }), [])
  assert.deepEqual(notasDoLote(lista, { situacao: 'todas', ids: ['3', '4', '5'] }), [])
})

test('notasDoLote com seleção leva só as marcadas que estão na lista, ignorando id de fora', () => {
  assert.deepEqual(notasDoLote(lista, { situacao: 'autorizada', ids: ['1', '2', 'de-outra-conta'] }).map(n => n.id), ['1', '2'])
})

test('selecaoDaPagina diz o estado da caixa do cabeçalho e da faixa de seleção', () => {
  const pagina = ['1', '2', '3']
  assert.equal(selecaoDaPagina(pagina, new Set(), false), 'nenhuma')
  assert.equal(selecaoDaPagina(pagina, new Set(['2']), false), 'parte')
  assert.equal(selecaoDaPagina(pagina, new Set(['1', '2', '3']), false), 'pagina')
  assert.equal(selecaoDaPagina(pagina, new Set(), true), 'filtro')
  assert.equal(selecaoDaPagina([], new Set(), false), 'nenhuma', 'página sem nota com documento')
})
