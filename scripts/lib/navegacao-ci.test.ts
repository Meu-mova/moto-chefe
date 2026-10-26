import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fundosClarosGrandes, menuNoHamburguer, nomePrint, tocaTelas, type CaixaComFundo } from './navegacao-ci'

const TELA = { largura: 390, altura: 844 }
const caixa = (cor: [number, number, number, number], largura: number, altura: number): CaixaComFundo =>
  ({ html: '<div>', r: cor[0], g: cor[1], b: cor[2], a: cor[3], largura, altura })

test('tocaTelas: só PR com arquivo em src/app ou src/components', () => {
  assert.equal(tocaTelas(['src/app/(dashboard)/loading.tsx']), true)
  assert.equal(tocaTelas(['README.md', 'src/components/ui/button.tsx']), true)
  assert.equal(tocaTelas(['src/lib/navegacao.ts', 'scripts/smoke.ts']), false)
  assert.equal(tocaTelas([]), false)
})

test('menu no hambúrguer em 390 e 768, barra lateral em 1280', () => {
  assert.deepEqual([390, 768, 1280].map(menuNoHamburguer), [true, true, false])
})

test('bloco branco do tamanho do esqueleto do loading.tsx (h-96) é acusado', () => {
  assert.equal(fundosClarosGrandes([caixa([255, 255, 255, 255], 358, 384)], TELA).length, 1)
})

test('fundo escuro, transparente ou pequeno não é acusado', () => {
  assert.deepEqual(fundosClarosGrandes([
    caixa([24, 24, 27, 255], 390, 844),
    caixa([255, 255, 255, 0], 390, 844),
    caixa([255, 255, 255, 255], 40, 40),
  ], TELA), [])
})

test('elemento maior que a tela conta só a parte que cabe nela', () => {
  // 390 x 60 cabe na tela: 7% dela, mesmo com o elemento tendo 2000 px de largura.
  assert.deepEqual(fundosClarosGrandes([caixa([241, 245, 249, 255], 2000, 60)], TELA), [])
})

test('nomePrint: tema, largura, passo com 2 dígitos e rota sem barra', () => {
  assert.equal(nomePrint('escuro', 390, 3, '/relatorios/coletiva', 'esqueleto'), 'escuro-390-03-relatorios_coletiva-esqueleto.png')
})
