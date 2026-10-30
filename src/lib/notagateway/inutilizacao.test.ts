import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegivelParaInutilizar, pedidoSemRespostaVenceu, situacaoInutilizacao, STATUS_NAO_ENVIADA, STATUS_SEM_CONFIGURACAO, validarJustificativa } from './inutilizacao'

test('justificativa: tira acentos e espaços sobrando', () => {
  assert.deepEqual(validarJustificativa('  Venda cancelada após\n a rejeição  '), { ok: true, justificativa: 'Venda cancelada apos a rejeicao' })
})

test('justificativa: aceita de 15 a 255 caracteres', () => {
  assert.equal(validarJustificativa('a'.repeat(15)).ok, true)
  assert.equal(validarJustificativa('a'.repeat(255)).ok, true)
  assert.equal(validarJustificativa('a'.repeat(14)).ok, false)
  assert.equal(validarJustificativa('a'.repeat(256)).ok, false)
})

test('justificativa: recusa caractere fora do ASCII básico que não é acento', () => {
  assert.equal(validarJustificativa('Venda cancelada — sem reenvio').ok, false)
})

test('situação: lê os status finais da API; o resto está em andamento', () => {
  assert.equal(situacaoInutilizacao('InutilizacaoAutorizada'), 'autorizada')
  assert.equal(situacaoInutilizacao('InutilizacaoNegada'), 'negada')
  // Nomes que a consulta da homologação devolveu de fato.
  assert.equal(situacaoInutilizacao('Autorizada'), 'autorizada')
  assert.equal(situacaoInutilizacao('Negada'), 'negada')
  assert.equal(situacaoInutilizacao('Processando'), 'pendente')
  assert.equal(situacaoInutilizacao('Enviando'), 'pendente')
})

const negada = { status: 'Negada', motivoStatus: '225 - Falha no schema', numero: '974', serie: '1', vendaId: null }

test('elegível: rejeitada de venda cancelada, com número e série', () => {
  assert.deepEqual(elegivelParaInutilizar(negada, null), { ok: true, serie: '1', numero: 974 })
})

test('elegível: rejeitada de venda ativa que já saiu em outra nota, com outro número', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, vendaId: 'v1' }, { numero: '975' }).ok, true)
})

test('não elegível: rejeitada de venda ativa, que ainda vai ser reenviada', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, vendaId: 'v1' }, null).ok, false)
  assert.equal(elegivelParaInutilizar({ ...negada, vendaId: 'v1' }, { numero: '974' }).ok, false)
  assert.equal(elegivelParaInutilizar({ ...negada, vendaId: 'v1' }, { numero: '0974' }).ok, false)
})

test('não elegível: sem número ou série gravados', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, numero: null }, null).ok, false)
  assert.equal(elegivelParaInutilizar({ ...negada, serie: null }, null).ok, false)
})

test('não elegível: denegada, que chega como "Negada" e já usou o número', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, motivoStatus: '301 - Uso Denegado: irregularidade fiscal do emitente' }, null).ok, false)
  assert.equal(elegivelParaInutilizar({ ...negada, motivoStatus: '302: Uso Denegado' }, null).ok, false)
})

test('não elegível: 539, número já usado em outra nota na SEFAZ', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, motivoStatus: '539 - Duplicidade de NF-e' }, null).ok, false)
})

test('não elegível: descartada, autorizada, cancelada ou em andamento', () => {
  for (const status of ['Descartada', 'Denegada', 'Autorizada', 'Cancelada', 'Processando', 'Enviando']) {
    assert.equal(elegivelParaInutilizar({ ...negada, status }, null).ok, false, status)
  }
})

test('situação: pedido não enviado e sem configuração contam como negada, que libera o número', () => {
  assert.equal(situacaoInutilizacao(STATUS_NAO_ENVIADA), 'negada')
  assert.equal(situacaoInutilizacao(STATUS_SEM_CONFIGURACAO), 'negada')
})

test('pedido que a NG não conhece só vence depois de 15 minutos', () => {
  const criado = new Date('2026-10-29T12:00:00Z')
  assert.equal(pedidoSemRespostaVenceu(criado, new Date('2026-10-29T12:14:59Z')), false)
  assert.equal(pedidoSemRespostaVenceu(criado, new Date('2026-10-29T12:15:00Z')), true)
})
