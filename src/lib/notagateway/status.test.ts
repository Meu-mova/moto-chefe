import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STATUS_MORTOS, ehFinal, ehRecusada } from './status'

// Os status não finais da doc "Status da nota fiscal" da Nota Gateway.
const INTERMEDIARIOS = [
  'AguardandoAutorizacao', 'SolicitandoAutorizacao', 'AutorizacaoSolicitada',
  'EmProcessoDeAutorizacao', 'AutorizadaAguardandoGeracaoPDF',
  'SolicitandoCancelamento', 'CancelamentoSolicitado', 'EmProcessoDeCancelamento',
  'CanceladaAguardandoAtualizacaoPDF',
]

test('nenhum status intermediário da API está na lista que libera nova emissão', () => {
  for (const status of INTERMEDIARIOS) assert.equal(STATUS_MORTOS.includes(status), false, status)
})

test('Autorizada, CancelamentoNegado e os nossos status de envio não estão na lista que libera nova emissão', () => {
  for (const status of ['Autorizada', 'CancelamentoNegado', 'Enviando', 'Processando']) {
    assert.equal(STATUS_MORTOS.includes(status), false, status)
  }
})

test('Negada, Denegada e Cancelada estão na lista que libera nova emissão', () => {
  for (const status of ['Negada', 'Denegada', 'Cancelada']) assert.equal(STATUS_MORTOS.includes(status), true, status)
})

test('Autorizada, Negada, Denegada, Cancelada e CancelamentoNegado são finais', () => {
  for (const status of ['Autorizada', 'Negada', 'Denegada', 'Cancelada', 'CancelamentoNegado']) {
    assert.equal(ehFinal(status), true, status)
  }
})

test('status intermediários, os nossos status de envio e um status novo da API não são finais', () => {
  for (const status of [...INTERMEDIARIOS, 'Enviando', 'Processando', 'StatusNovoDaApi']) {
    assert.equal(ehFinal(status), false, status)
  }
})

test('só Negada e Denegada contam como recusa da SEFAZ', () => {
  for (const status of ['Negada', 'Denegada']) assert.equal(ehRecusada(status), true, status)
  for (const status of ['Autorizada', 'Cancelada', 'CancelamentoNegado', 'EmProcessoDeAutorizacao', 'Enviando']) {
    assert.equal(ehRecusada(status), false, status)
  }
})

test('o índice da trava, na migração mais recente que o cria, libera os mesmos status que o código', () => {
  const pasta = resolve(process.cwd(), 'src/lib/db/migrations')
  const ultima = readdirSync(pasta)
    .filter(nome => nome.endsWith('.sql'))
    .sort()
    .map(nome => readFileSync(resolve(pasta, nome), 'utf8'))
    .filter(sql => /CREATE UNIQUE INDEX (IF NOT EXISTS )?notas_fiscais_saida_uma_viva_idx/.test(sql))
    .at(-1)
  const lista = ultima?.match(/status NOT IN \(([^)]*)\)/)?.[1]
  assert.ok(lista, 'a migração mais recente do índice precisa ter o "status NOT IN (...)" da trava')
  const doBanco = [...lista.matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
  assert.deepEqual(doBanco, [...STATUS_MORTOS].sort())
})
