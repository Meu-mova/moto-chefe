import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeDescartarCarta, recusaNaGateway, proximoNumeroCarta, situacaoCarta, validarTextoCarta } from './carta-correcao'

test('texto da carta: aceita de 15 a 1000 caracteres, contados sem os espaços das pontas', () => {
  assert.equal(validarTextoCarta('Chassi correto: X').ok, true)
  assert.equal(validarTextoCarta('a'.repeat(1000)).ok, true)
  assert.equal(validarTextoCarta('a'.repeat(14)).ok, false)
  assert.equal(validarTextoCarta('a'.repeat(1001)).ok, false)
  assert.equal(validarTextoCarta(`  \n${'a'.repeat(14)}\n  `).ok, false)
})

test('texto da carta: devolve o texto sem quebras ou espaços nas pontas, que a SEFAZ rejeita', () => {
  const r = validarTextoCarta('\n  Onde se lê chassi A, leia-se chassi B.\n')
  assert.deepEqual(r, { ok: true, texto: 'Onde se lê chassi A, leia-se chassi B.' })
})

test('número da carta: a primeira é 1 e as seguintes continuam das autorizadas', () => {
  assert.deepEqual(proximoNumeroCarta([]), { ok: true, numero: 1 })
  assert.deepEqual(proximoNumeroCarta([{ numero: 1, situacao: 'autorizada' }, { numero: 2, situacao: 'autorizada' }]), { ok: true, numero: 3 })
})

test('número da carta: recusada não consome número', () => {
  const cartas = [{ numero: 1, situacao: 'autorizada' }, { numero: 2, situacao: 'recusada' }] as const
  assert.deepEqual(proximoNumeroCarta([...cartas]), { ok: true, numero: 2 })
})

test('número da carta: carta aguardando a SEFAZ impede outra', () => {
  assert.equal(proximoNumeroCarta([{ numero: 1, situacao: 'pendente' }]).ok, false)
})

test('número da carta: depois da 20ª autorizada não há mais carta', () => {
  const vinte = Array.from({ length: 20 }, (_, i) => ({ numero: i + 1, situacao: 'autorizada' as const }))
  assert.equal(proximoNumeroCarta(vinte).ok, false)
})

test('status da carta: "Autorizada" e "Negada" encerram; o resto segue pendente', () => {
  assert.equal(situacaoCarta('Autorizada'), 'autorizada')
  assert.equal(situacaoCarta('Negada'), 'recusada')
  assert.equal(situacaoCarta('Processando'), 'pendente')
})

test('descartar carta: só pendente há 15 minutos ou mais', () => {
  const agora = new Date('2026-10-16T12:00:00Z')
  assert.equal(podeDescartarCarta({ situacao: 'pendente', criadoEm: '2026-10-16T11:45:00Z' }, agora), true)
  assert.equal(podeDescartarCarta({ situacao: 'pendente', criadoEm: '2026-10-16T11:46:00Z' }, agora), false)
  assert.equal(podeDescartarCarta({ situacao: 'autorizada', criadoEm: '2026-10-16T10:00:00Z' }, agora), false)
})

test('recusa na Nota Gateway: status fora de Autorizada/Processando com motivo libera o descarte, com o motivo da SEFAZ', () => {
  assert.equal(recusaNaGateway({ status: 'Rejeitada', motivoStatus: 'Rejeição 594: limite de cartas' }), 'Rejeição 594: limite de cartas')
  assert.equal(recusaNaGateway({ status: 'Processando', motivoStatus: 'Lote em processamento' }), null)
  assert.equal(recusaNaGateway({ status: 'Autorizada', motivoStatus: 'Evento registrado' }), null)
  assert.equal(recusaNaGateway({ status: 'Rejeitada', motivoStatus: null }), null)
  assert.equal(recusaNaGateway({ status: 'Rejeitada', motivoStatus: '  ' }), null)
})
