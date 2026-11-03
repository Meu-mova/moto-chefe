import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FolhaMesResumo } from './folha-mes-resumo'

const totais = { salarios: 13500, comissoes: 4342.1, premiacoes: 600, ajudaCusto: 950, adiantamentos: 2600, geral: 16792.1, efetivo: 16808.1, reaisInformados: 3 }
const html = (t = totais, ativos = 6) => renderToStaticMarkup(createElement(FolhaMesResumo, { totais: t, ativos }))
const texto = (h: string) => h.replace(/<[^>]+>/g, '|').replace(/\|+/g, '|')

test('destaque com Total geral e Pago real, e a contagem de valores informados', () => {
  const t = texto(html())
  assert.match(t, /Total geral\|R\$ 16\.792,10/)
  assert.match(t, /Pago real\|R\$ 16\.808,10\|3 de 6 informados/)
})

test('os 5 cartões das partes, com o adiantamento descontado (sinal de menos)', () => {
  const t = texto(html())
  for (const parte of ['Salários|R$ 13.500,00', 'Comissões|R$ 4.342,10', 'Premiações|R$ 600,00', 'Ajuda de custo|R$ 950,00', 'Adiantamentos|-R$ 2.600,00']) {
    assert.ok(t.includes(parte), parte)
  }
})

test('sem adiantamento o cartão mostra R$ 0,00, sem sinal', () => {
  const t = texto(html({ ...totais, adiantamentos: 0 }))
  assert.ok(t.includes('Adiantamentos|R$ 0,00'))
})
