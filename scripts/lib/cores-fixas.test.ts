import { test } from 'node:test'
import assert from 'node:assert/strict'
import { acharCoresFixas, area, linhasAdicionadas, verificaArquivo } from './cores-fixas'

test('paleta do Tailwind, branco e preto contam como cor fixa', () => {
  assert.deepEqual(acharCoresFixas('className="bg-slate-900 text-emerald-500 hover:bg-white"'), ['bg-slate-900', 'text-emerald-500', 'bg-white'])
  assert.deepEqual(acharCoresFixas('border-red-200/60 dark:text-black from-sky-50'), ['border-red-200/60', 'text-black', 'from-sky-50'])
})

test('valor arbitrário, hex, rgb e oklch contam', () => {
  assert.deepEqual(acharCoresFixas('bg-[#047a4f]'), ['bg-[#047a4f]'])
  assert.deepEqual(acharCoresFixas("stroke: '#e2e8f0'"), ['#e2e8f0'])
  assert.deepEqual(acharCoresFixas('color: rgb(4 122 79)'), ['rgb(4 122 79)'])
  assert.deepEqual(acharCoresFixas('fill="oklch(0.5 0.1 120)"'), ['oklch(0.5 0.1 120)'])
})

test('cor com nome e texto comum não contam', () => {
  for (const linha of [
    'className="bg-background text-foreground bg-card text-muted-foreground border-input"',
    'bg-primary text-primary-text text-destructive/80 bg-warning/10',
    'Refs #90, issue #1234',
    'text-sm text-xs border-2 bg-transparent text-current',
    "fill: 'var(--chart-1)'",
  ]) assert.deepEqual(acharCoresFixas(linha), [], linha)
})

test('comentário e linha liberada com cor-fixa-ok não contam', () => {
  assert.deepEqual(acharCoresFixas('// troca bg-white por bg-card'), [])
  assert.deepEqual(acharCoresFixas(' * bg-slate-900'), [])
  assert.deepEqual(acharCoresFixas('.match(/<p class="text-white">/) // cor-fixa-ok: HTML da fábrica'), [])
})

test('só arquivos de interface entram; globals.css, marca e testes ficam fora', () => {
  assert.equal(verificaArquivo('src/app/(dashboard)/vendas/page.tsx'), true)
  assert.equal(verificaArquivo('src/components/ui/button.tsx'), true)
  assert.equal(verificaArquivo('src/app/globals.css'), false)
  assert.equal(verificaArquivo('src/app/icon.svg'), false)
  assert.equal(verificaArquivo('public/brand/mova-nome-claro.svg'), false)
  assert.equal(verificaArquivo('src/lib/x.test.ts'), false)
  assert.equal(verificaArquivo('scripts/cores-fixas.ts'), false)
})

test('área agrupa pelo módulo da rota', () => {
  assert.equal(area('src/app/(dashboard)/vendas/components/x.tsx'), 'vendas')
  assert.equal(area('src/app/(print)/vendas/[id]/page.tsx'), '(print)')
  assert.equal(area('src/components/ui/button.tsx'), 'components/ui')
  assert.equal(area('src/components/sidebar.tsx'), 'components')
  assert.equal(area('src/app/assinar/[token]/x.tsx'), 'assinar')
})

test('linhasAdicionadas lê o diff unificado com número de linha', () => {
  const diff = [
    'diff --git a/src/a.tsx b/src/a.tsx',
    '+++ b/src/a.tsx',
    '@@ -1,2 +10,3 @@',
    ' contexto',
    '-<div className="bg-white">',
    '+<div className="bg-card">',
    '+<p className="text-red-600">',
    '+++ b/src/b.tsx',
    '@@ -0,0 +1 @@',
    '+oi',
  ].join('\n')
  assert.deepEqual(linhasAdicionadas(diff), [
    { arquivo: 'src/a.tsx', linha: 11, texto: '<div className="bg-card">' },
    { arquivo: 'src/a.tsx', linha: 12, texto: '<p className="text-red-600">' },
    { arquivo: 'src/b.tsx', linha: 1, texto: 'oi' },
  ])
})
