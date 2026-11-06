import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { listarArquivos } from '@/test/listar-arquivos'

// O `client` (postgres.js) só pode ser usado pela fila de src/lib/jarvis/conexao.ts (#701):
// fora dela, consultas simultâneas voltam a dividir a conexão e o pooler 6543 trava.
const RAIZ = join(__dirname, '..', '..', '..')
const UNICO_PERMITIDO = 'src/lib/jarvis/conexao.ts'

const MODULO_DO_DB = /^(@\/lib\/db|\.{1,2}(\/\.\.)*\/(lib\/)?db|\.)(\/index)?$/

// Formas cobertas: `import { client }`, `export { client } from` e `import * as x` seguido de `x.client`.
// `await import()` e `require` ficam de fora: nenhum arquivo do app usa essas formas para o banco.
function importaClientDoDb(codigo: string): boolean {
  const porNome = [...codigo.matchAll(/(?:import|export)\s*(type\s*)?\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)].some(
    ([, soTipo, nomes, modulo]) =>
      !soTipo && MODULO_DO_DB.test(modulo) && nomes.split(',').some(n => /^\s*client(\s+as\s+\w+)?\s*$/.test(n)),
  )
  const porNamespace = [...codigo.matchAll(/import\s*\*\s*as\s+(\w+)\s+from\s*['"]([^'"]+)['"]/g)].some(
    ([, apelido, modulo]) => MODULO_DO_DB.test(modulo) && new RegExp(`\\b${apelido}\\.client\\b`).test(codigo),
  )
  return porNome || porNamespace
}

const arquivosDoApp = (pasta: string) => listarArquivos(pasta, f => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))

test('reconhece import do client vindo de src/lib/db', () => {
  assert.equal(importaClientDoDb("import { client } from '@/lib/db'"), true)
  assert.equal(importaClientDoDb("import { db, client as pg2 } from '@/lib/db/index'"), true)
  assert.equal(importaClientDoDb('import { client } from "../db"'), true)
})

test('reconhece o client por re-export e por import de namespace', () => {
  assert.equal(importaClientDoDb("export { client } from '@/lib/db'"), true)
  assert.equal(importaClientDoDb("import * as banco from '@/lib/db'\nawait banco.client`select 1`"), true)
})

test('não confunde com outros imports', () => {
  assert.equal(importaClientDoDb("import { db, execRows } from '@/lib/db'"), false)
  assert.equal(importaClientDoDb("import { client } from '@/lib/notagateway/client'"), false)
  assert.equal(importaClientDoDb("import { clientes } from '@/lib/db'"), false)
  assert.equal(importaClientDoDb("import * as banco from '@/lib/db'\nawait banco.db.select()"), false)
})

test('só a fila do Jarvis importa o client do postgres.js', () => {
  const quemImporta = arquivosDoApp(join(RAIZ, 'src'))
    .filter(f => importaClientDoDb(readFileSync(f, 'utf8')))
    .map(f => relative(RAIZ, f))
  assert.deepEqual(quemImporta, [UNICO_PERMITIDO])
})
