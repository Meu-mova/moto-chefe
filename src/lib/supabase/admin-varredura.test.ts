import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { listarArquivos } from '@/test/listar-arquivos'

// Trava contra nova cópia do cliente com a chave de serviço (#900): ela ignora RLS e
// só pode nascer em src/lib/supabase/admin.ts.
const RAIZ = join(__dirname, '..', '..', '..')
const MODULO = 'src/lib/supabase/admin.ts'

// Qualquer forma de trazer o pacote: import (inclusive `import type`), re-export, import() e require().
function importaSupabaseJs(codigo: string): boolean {
  return /(?:from\s*|import\(\s*|require\(\s*)['"]@supabase\/supabase-js['"]/.test(codigo)
}

const fontes = listarArquivos(join(RAIZ, 'src'), f => /\.[cm]?[jt]sx?$/.test(f) && !/\.test\.[cm]?[jt]sx?$/.test(f))
  .map(f => ({ arquivo: relative(RAIZ, f), texto: readFileSync(f, 'utf8') }))

test('reconhece o pacote com aspas simples ou duplas, por import, import() e require()', () => {
  for (const codigo of [
    "import { createClient } from '@supabase/supabase-js'",
    'import { createClient } from "@supabase/supabase-js"',
    "import type { SupabaseClient } from '@supabase/supabase-js'",
    "export { createClient } from '@supabase/supabase-js'",
    "const { createClient } = await import('@supabase/supabase-js')",
    'const { createClient } = require("@supabase/supabase-js")',
  ]) assert.equal(importaSupabaseJs(codigo), true, codigo)
})

test('não confunde com os outros pacotes do Supabase', () => {
  for (const codigo of [
    "import { createServerClient } from '@supabase/ssr'",
    "import { clienteSupabaseAdmin } from '@/lib/supabase/admin'",
    '// o supabase-js manda o próprio signal',
  ]) assert.equal(importaSupabaseJs(codigo), false, codigo)
})

test('a chave de serviço só aparece no módulo único', () => {
  assert.deepEqual(fontes.filter(f => f.texto.includes('SUPABASE_SERVICE_ROLE_KEY')).map(f => f.arquivo), [MODULO])
})

test('só o módulo único traz o @supabase/supabase-js (nem só o tipo)', () => {
  assert.deepEqual(fontes.filter(f => importaSupabaseJs(f.texto)).map(f => f.arquivo), [MODULO])
})
