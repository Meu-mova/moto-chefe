// Regras de apresentação da aba Holerites (#629): a conta do topo, quem falta e os textos do envio.
import test from 'node:test'
import assert from 'node:assert/strict'
import { resumirEnvios, rotuloEnviado, descricaoEnvio, fmtTamanho, TIPOS_HOLERITE } from './holerites-tela'

const pessoas = ['a', 'b', 'c', 'd', 'e', 'f'].map(id => ({ id }))
const envio = (usuarioId: string, tipo: string) => ({ usuarioId, tipo })

test('os dois tipos, na ordem das colunas', () => {
  assert.deepEqual(TIPOS_HOLERITE.map(t => [t.valor, t.nome, t.curto]), [
    ['adiantamento', 'Adiantamento', 'Adiantamento'],
    ['salario', 'Pagamento do salário', 'Salário'],
  ])
})

test('6 pessoas, 5 envios: 5 de 12, por tipo e quem falta', () => {
  const r = resumirEnvios(pessoas, [
    envio('a', 'adiantamento'), envio('a', 'salario'), envio('b', 'adiantamento'),
    envio('c', 'salario'), envio('d', 'adiantamento'),
  ])
  assert.equal(r.enviados, 5)
  assert.equal(r.esperados, 12)
  assert.equal(r.porcentagem, 42)
  assert.deepEqual(r.porTipo.map(t => [t.valor, t.enviados]), [['adiantamento', 3], ['salario', 2]])
  assert.deepEqual(r.pessoasComFalta, ['b', 'c', 'd', 'e', 'f'])
})

test('sem funcionários: 0 de 0 sem dividir por zero', () => {
  const r = resumirEnvios([], [])
  assert.deepEqual([r.enviados, r.esperados, r.porcentagem, r.pessoasComFalta], [0, 0, 0, []])
})

test('holerite de quem saiu (fora da lista de ativos) não entra na conta', () => {
  const r = resumirEnvios(pessoas.slice(0, 1), [envio('a', 'salario'), envio('saiu', 'salario'), envio('saiu', 'adiantamento')])
  assert.equal(r.enviados, 1)
  assert.equal(r.esperados, 2)
})

test('tipo desconhecido não conta como envio', () => {
  assert.equal(resumirEnvios(pessoas.slice(0, 1), [envio('a', 'outro')]).enviados, 0)
})

test('todos completos: ninguém com falta', () => {
  const todos = pessoas.flatMap(p => [envio(p.id, 'adiantamento'), envio(p.id, 'salario')])
  assert.deepEqual(resumirEnvios(pessoas, todos).pessoasComFalta, [])
})

test('"Enviado DD/MM" usa o dia de Brasília, não o UTC', () => {
  assert.equal(rotuloEnviado(new Date('2026-11-01T02:30:00Z')), 'Enviado 31/10')
  assert.equal(rotuloEnviado(new Date('2026-10-05T15:00:00Z')), 'Enviado 05/10')
})

test('descrição do detalhe: data, quem enviou e tamanho, omitindo o que falta', () => {
  const quando = new Date('2026-10-05T15:00:00Z')
  assert.equal(descricaoEnvio({ enviadoEm: quando, enviadoPorNome: 'Auxiliar C', tamanho: 83 * 1024 }), 'Enviado em 05/10/2026 por Auxiliar C, 83 KB.')
  assert.equal(descricaoEnvio({ enviadoEm: quando, enviadoPorNome: null, tamanho: null }), 'Enviado em 05/10/2026.')
})

test('tamanho em KB ou MB; vazio sem tamanho', () => {
  assert.equal(fmtTamanho(null), '')
  assert.equal(fmtTamanho(83 * 1024), '83 KB')
  assert.equal(fmtTamanho(1.5 * 1024 * 1024), '1.5 MB')
})
