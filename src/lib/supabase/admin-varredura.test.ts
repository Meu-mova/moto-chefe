import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'

// Trava contra nova cópia do cliente com a chave de serviço (#900): ela ignora RLS e
// só pode nascer em src/lib/supabase/admin.ts.
const MODULO = 'src/lib/supabase/admin.ts'

const arquivosDe = (pasta: string): string[] =>
  readdirSync(pasta, { withFileTypes: true }).flatMap(e => {
    const caminho = join(pasta, e.name)
    if (e.isDirectory()) return arquivosDe(caminho)
    return /\.(ts|tsx|js|mjs)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [caminho] : []
  })

const raiz = process.cwd()
const fontes = arquivosDe(join(raiz, 'src')).map(c => ({ arquivo: relative(raiz, c), texto: readFileSync(c, 'utf8') }))
const quemTem = (padrao: RegExp) => fontes.filter(f => padrao.test(f.texto)).map(f => f.arquivo).sort()

test('a chave de serviço só aparece no módulo único', () => {
  assert.deepEqual(quemTem(/SUPABASE_SERVICE_ROLE_KEY/), [MODULO])
})

test('só o módulo único importa o @supabase/supabase-js', () => {
  assert.deepEqual(quemTem(/from '@supabase\/supabase-js'|import\('@supabase\/supabase-js'\)/), [MODULO])
})
