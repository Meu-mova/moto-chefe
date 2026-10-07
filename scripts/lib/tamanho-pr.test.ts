import { test } from 'node:test'
import assert from 'node:assert/strict'
import { caminhoFinal, contaNoLimite, contarLinhasDeProducao, montarComentario, MARCADOR_COMENTARIO } from './tamanho-pr'

test('código de produção e migração escrita à mão contam', () => {
  assert.equal(contaNoLimite('src/app/(dashboard)/vendas/page.tsx'), true)
  assert.equal(contaNoLimite('src/lib/db/migrations/0111_algo.sql'), true)
  assert.equal(contaNoLimite('.github/workflows/ci.yml'), true)
})

test('testes, docs, gerados e lockfile não contam', () => {
  for (const arquivo of [
    'src/lib/folha.test.ts',
    'src/app/x/componente.test.tsx',
    'AGENTS.md',
    'docs/infra/staging.md',
    'src/lib/db/migrations/meta/_journal.json',
    'supabase/schema-baseline.sql',
    'package-lock.json',
  ]) assert.equal(contaNoLimite(arquivo), false, arquivo)
})

test('renomeação vale pelo caminho novo', () => {
  assert.equal(caminhoFinal('src/lib/{velho.ts => novo.ts}'), 'src/lib/novo.ts')
  assert.equal(caminhoFinal('a.ts => b.ts'), 'b.ts')
  assert.equal(caminhoFinal('src/{ => lib}/x.ts'), 'src/lib/x.ts')
  assert.equal(caminhoFinal('src/{lib => }/x.ts'), 'src/x.ts')
})

test('soma adições e remoções só do que conta, do maior para o menor', () => {
  const numstat = [
    '10\t5\tsrc/lib/a.ts',
    '300\t0\tsrc/lib/a.test.ts',
    '40\t60\tsrc/app/b.tsx',
    '7\t0\tdocs/x.md',
    '-\t-\tpublic/logo.png',
    '0\t0\tsrc/{velho.ts => novo.ts}',
    '',
  ].join('\n')
  assert.deepEqual(contarLinhasDeProducao(numstat), {
    total: 115,
    arquivos: [{ arquivo: 'src/app/b.tsx', linhas: 100 }, { arquivo: 'src/lib/a.ts', linhas: 15 }],
  })
})

test('até 400 o comentário só informa; acima, lista arquivos e pede justificativa depois de 500', () => {
  const pequeno = montarComentario({ total: 400, arquivos: [] })
  assert.ok(pequeno.startsWith(MARCADOR_COMENTARIO))
  assert.match(pequeno, /dentro do alvo/)

  const medio = montarComentario({ total: 450, arquivos: [{ arquivo: 'src/a.ts', linhas: 450 }] })
  assert.match(medio, /\| `src\/a\.ts` \| 450 \|/)
  assert.doesNotMatch(medio, /justifique/)

  const grande = montarComentario({ total: 501, arquivos: [{ arquivo: 'src/a.ts', linhas: 501 }] })
  assert.match(grande, /justifique na descrição/)
})
