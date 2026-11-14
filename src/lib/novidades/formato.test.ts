// Formato das Novidades da versão (#883): o PR da release com texto fora do formato fica vermelho.
// Primeiro a regra contra amostras ruins; depois a lista de verdade.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { problemasDaNovidade, versoesRepetidas } from './formato'
import type { NovidadeDaVersao } from './tipos'

const boa: NovidadeDaVersao = { versao: '1.36.0', data: '2026-11-13', novidades: [{ titulo: 'Título', texto: 'Texto simples.' }] }
const comItem = (titulo: string, texto: string): NovidadeDaVersao => ({ ...boa, novidades: [], correcoes: [{ titulo, texto }] })

test('texto no formato não tem problema', () => {
  assert.deepEqual(problemasDaNovidade(boa), [])
  assert.deepEqual(problemasDaNovidade({ ...boa, novidades: undefined, correcoes: [{ titulo: 'Só correção', texto: 'Texto.' }] }), [])
})

test('versão fora de X.Y.Z é recusada', () => {
  for (const versao of ['1.36', 'v1.36.0', '1.36.0-beta', '01.36.0', '']) {
    assert.deepEqual(problemasDaNovidade({ ...boa, versao }), [`versão "${versao}" não é X.Y.Z`], versao)
  }
})

test('data que não é AAAA-MM-DD de um dia que existe é recusada', () => {
  for (const data of ['13/11/2026', '2026-11', '2026-02-31', '']) {
    assert.deepEqual(problemasDaNovidade({ ...boa, data }), [`1.36.0: data "${data}" não é AAAA-MM-DD`], data)
  }
})

test('versão sem nenhum item é recusada', () => {
  assert.deepEqual(problemasDaNovidade({ ...boa, novidades: [] }), ['1.36.0: sem nenhum item'])
  assert.deepEqual(problemasDaNovidade({ versao: '1.36.0', data: '2026-11-13' }), ['1.36.0: sem nenhum item'])
})

test('item sem título ou sem texto é recusado', () => {
  assert.deepEqual(problemasDaNovidade(comItem('  ', 'Texto.')), ['1.36.0: item sem título'])
  assert.deepEqual(problemasDaNovidade(comItem('Título', '')), ['1.36.0: item "Título" sem texto'])
})

test('link e travessão no título ou no texto são recusados', () => {
  assert.deepEqual(problemasDaNovidade(comItem('Título', 'Veja em https://meumova.com')), ['1.36.0: item "Título" com link'])
  assert.deepEqual(problemasDaNovidade(comItem('Título', 'Veja em www.meumova.com')), ['1.36.0: item "Título" com link'])
  assert.deepEqual(problemasDaNovidade(comItem('Título', 'Detalhes no HTTP://site')), ['1.36.0: item "Título" com link'])
  assert.deepEqual(problemasDaNovidade(comItem('Título — novo', 'Texto.')), ['1.36.0: item "Título — novo" com travessão'])
  assert.deepEqual(problemasDaNovidade(comItem('Título', 'Antes – depois.')), ['1.36.0: item "Título" com travessão'])
})

test('versão repetida na lista é apontada uma vez', () => {
  assert.deepEqual(versoesRepetidas([boa, { ...boa, data: '2026-11-14' }, boa, { ...boa, versao: '1.37.0' }]), ['1.36.0'])
  assert.deepEqual(versoesRepetidas([boa, { ...boa, versao: '1.37.0' }]), [])
})

test('lista de verdade: toda versão no formato e nenhuma repetida', async () => {
  const { NOVIDADES_DA_VERSAO } = await import('./lista')
  assert.ok(NOVIDADES_DA_VERSAO.length > 0)
  assert.deepEqual(NOVIDADES_DA_VERSAO.flatMap(problemasDaNovidade), [])
  assert.deepEqual(versoesRepetidas(NOVIDADES_DA_VERSAO), [])
})

test('lista de verdade: todo arquivo de versoes/ está na lista, com a versão do nome do arquivo', async () => {
  const { NOVIDADES_DA_VERSAO } = await import('./lista')
  const { listarArquivos } = await import('@/test/listar-arquivos')
  const { basename } = await import('node:path')
  const dosArquivos = listarArquivos('src/lib/novidades/versoes').map(f => basename(f, '.ts')).sort()
  assert.deepEqual(NOVIDADES_DA_VERSAO.map(n => n.versao).sort(), dosArquivos)
})
