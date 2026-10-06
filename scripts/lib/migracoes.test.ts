import { test } from 'node:test'
import assert from 'node:assert/strict'
import { arquivosDoBaseline, checksumDe, filtrarArquivosMigracao, planejar, temControleDeTransacao } from './migracoes'

const a = (arquivo: string, conteudo = arquivo) => ({ arquivo, checksum: checksumDe(conteudo) })

test('só NNNN_*.sql entram, em ordem', () => {
  assert.deepEqual(
    filtrarArquivosMigracao(['0110_b.sql', 'meta', '0002_a.sql', 'notas.md', '12_x.sql']),
    ['0002_a.sql', '0110_b.sql'],
  )
})

test('banco sem registros: tudo pendente, em ordem', () => {
  const plano = planejar([a('0002_b.sql'), a('0001_a.sql')], [])
  assert.deepEqual(plano.pendentes.map(p => p.arquivo), ['0001_a.sql', '0002_b.sql'])
  assert.deepEqual(plano.problemas, [])
})

test('só o que não foi registrado fica pendente', () => {
  const plano = planejar([a('0001_a.sql'), a('0002_b.sql')], [a('0001_a.sql')])
  assert.deepEqual(plano.pendentes.map(p => p.arquivo), ['0002_b.sql'])
  assert.deepEqual(plano.problemas, [])
})

test('registro sem arquivo no repo é problema', () => {
  const plano = planejar([a('0001_a.sql')], [a('0001_a.sql'), a('0002_sumiu.sql')])
  assert.equal(plano.problemas.length, 1)
  assert.match(plano.problemas[0], /0002_sumiu\.sql/)
})

test('arquivo editado depois de aplicado é problema', () => {
  const plano = planejar([a('0001_a.sql', 'versão nova')], [a('0001_a.sql', 'versão aplicada')])
  assert.equal(plano.problemas.length, 1)
  assert.match(plano.problemas[0], /checksum/)
})

test('dois arquivos com o mesmo número é problema', () => {
  const plano = planejar([a('0111_x.sql'), a('0111_y.sql')], [])
  assert.equal(plano.problemas.length, 1)
  assert.match(plano.problemas[0], /0111_x\.sql e 0111_y\.sql/)
})

test('baseline pega até o limite, inclusive', () => {
  const todos = [a('0000_a.sql'), a('0110_b.sql'), a('0111_c.sql')]
  assert.deepEqual(arquivosDoBaseline(todos, 110).map(x => x.arquivo), ['0000_a.sql', '0110_b.sql'])
})

test('pendente abaixo do maior aplicado sai em foraDeOrdem, mas continua pendente', () => {
  const plano = planejar([a('0001_a.sql'), a('0002_b.sql'), a('0003_c.sql')], [a('0001_a.sql'), a('0003_c.sql')])
  assert.deepEqual(plano.pendentes.map(p => p.arquivo), ['0002_b.sql'])
  assert.deepEqual(plano.foraDeOrdem, ['0002_b.sql'])
  assert.deepEqual(plano.problemas, [])
})

test('pendente acima do maior aplicado não sai em foraDeOrdem', () => {
  assert.deepEqual(planejar([a('0001_a.sql'), a('0002_b.sql')], [a('0001_a.sql')]).foraDeOrdem, [])
})

test('BEGIN; e COMMIT; soltos no arquivo são detectados', () => {
  assert.equal(temControleDeTransacao('BEGIN;\nalter table x add column y int;\nCOMMIT;'), true)
  assert.equal(temControleDeTransacao('alter table x add column y int;\n  commit ;'), true)
})

test('BEGIN de corpo plpgsql não é confundido com controle de transação', () => {
  const funcao = 'create function f() returns void language plpgsql as $$\nBEGIN\n  perform 1;\nEND;\n$$;'
  assert.equal(temControleDeTransacao(funcao), false)
})
