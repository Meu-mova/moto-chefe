import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { listarArquivos } from './listar-arquivos'
import { emailDeTeste, nomeDeTeste } from './semear-conta'

test('e-mail muda com o prefixo, o nome e o rótulo, e se repete com os mesmos três', () => {
  const base = emailDeTeste('AG404', 'A', 'aux_adm')
  assert.equal(emailDeTeste('AG404', 'A', 'aux_adm'), base)
  assert.notEqual(emailDeTeste('OS404', 'A', 'aux_adm'), base)
  assert.notEqual(emailDeTeste('AG404', 'B', 'aux_adm'), base)
  assert.notEqual(emailDeTeste('AG404', 'A', 'socio'), base)
  assert.match(base, /@teste\.invalid$/)
})

test('prefixos que começam igual não geram o mesmo e-mail (CG x CG449)', () => {
  assert.notEqual(emailDeTeste('CG', '449A', 'aux'), emailDeTeste('CG449', 'A', 'aux'))
})

test('nome da loja e da Conta carregam o prefixo e diferem entre si', () => {
  assert.equal(nomeDeTeste('AG404', 'A'), 'AG404 A')
  assert.equal(nomeDeTeste('AG404', 'A', 'Loja'), 'Loja AG404 A')
})

test('prefixo vazio é recusado', () => {
  assert.throws(() => nomeDeTeste('', 'A'), /prefixo/)
  assert.throws(() => emailDeTeste(' ', 'A', 'aux'), /prefixo/)
})

// Teste de banco roda em transação desfeita: dois arquivos com o mesmo prefixo não dão erro de
// UNIQUE, o 2º INSERT só espera o rollback do 1º. A trava tem que ser aqui, na leitura dos fontes.
const PREFIXO = /prefixo:\s*'([^']+)'/g

const arquivosDeBanco = (dir: string) => listarArquivos(dir, f => f.endsWith('.db.test.ts'))

type Uso = readonly [prefixo: string, arquivo: string]

// Minúsculas porque o e-mail da semente vai para minúsculas (emailDeTeste).
function prefixosRepetidos(usos: readonly Uso[]): string[] {
  const porPrefixo = usos.reduce((mapa, [prefixo, arquivo]) =>
    mapa.set(prefixo.toLowerCase(), [...(mapa.get(prefixo.toLowerCase()) ?? []), arquivo]), new Map<string, string[]>())
  return [...porPrefixo].filter(([, arquivos]) => new Set(arquivos).size > 1).map(([p, a]) => `${p}: ${[...new Set(a)].join(', ')}`)
}

test('prefixo repetido em outro arquivo é achado; no mesmo arquivo não', () => {
  assert.deepEqual(prefixosRepetidos([['AG404', 'a.ts'], ['AG404', 'a.ts'], ['OS404', 'b.ts']]), [])
  assert.deepEqual(prefixosRepetidos([['AG404', 'a.ts'], ['AG404', 'b.ts']]), ['ag404: a.ts, b.ts'])
})

test('prefixos que só diferem na caixa colidem (o e-mail vai para minúsculas)', () => {
  assert.equal(prefixosRepetidos([['AG404', 'a.ts'], ['ag404', 'b.ts']]).length, 1)
})

test('cada prefixo de semente é de um arquivo só', () => {
  const usos = arquivosDeBanco('src').flatMap(arquivo =>
    [...readFileSync(arquivo, 'utf8').matchAll(PREFIXO)].map(([, prefixo]): Uso => [prefixo, arquivo]))
  assert.deepEqual(prefixosRepetidos(usos), [])
})
