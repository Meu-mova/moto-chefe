import test from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
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

function arquivosDeBanco(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const caminho = join(dir, e.name)
    if (e.isDirectory()) return arquivosDeBanco(caminho)
    return e.name.endsWith('.db.test.ts') ? [caminho] : []
  })
}

test('cada prefixo de semente é de um arquivo só', () => {
  const porPrefixo = new Map<string, Set<string>>()
  for (const arquivo of arquivosDeBanco('src')) {
    for (const [, prefixo] of readFileSync(arquivo, 'utf8').matchAll(PREFIXO)) {
      porPrefixo.set(prefixo, (porPrefixo.get(prefixo) ?? new Set()).add(arquivo))
    }
  }
  const repetidos = [...porPrefixo].filter(([, arquivos]) => arquivos.size > 1).map(([p, a]) => `${p}: ${[...a].join(', ')}`)
  assert.deepEqual(repetidos, [])
})
