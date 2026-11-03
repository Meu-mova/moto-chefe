import { test } from 'node:test'
import assert from 'node:assert/strict'
import { oQueABaseFaz } from './base-do-cargo'

// Valores escritos à mão a partir das regras de hoje (spec #615). A tela acompanha a regra sozinha;
// este teste só avisa, quando uma regra de papel muda, que estes literais pedem revisão.
const resumo = ({ aprovaVenda, cancelaVenda, operaCaixa, emiteNF }: ReturnType<typeof oQueABaseFaz>) => ({ aprovaVenda, cancelaVenda, operaCaixa, emiteNF })
const NADA = { aprovaVenda: false, cancelaVenda: 'nao', operaCaixa: false, emiteNF: false } as const

test('o que cada base faz hoje: aprova, cancela venda, opera o caixa e emite NF', () => {
  assert.deepEqual(resumo(oQueABaseFaz('admin_socio')), { aprovaVenda: true, cancelaVenda: 'sim', operaCaixa: true, emiteNF: true })
  assert.deepEqual(resumo(oQueABaseFaz('aux_adm')), { aprovaVenda: false, cancelaVenda: 'sem-nf', operaCaixa: true, emiteNF: true })
  for (const base of ['vendedor', 'mecanico', 'motorista'] as const) assert.deepEqual(resumo(oQueABaseFaz(base)), NADA, base)
})

test('telas da base: o motorista vê só o básico; o adm. da loja vê o caixa', () => {
  assert.deepEqual(oQueABaseFaz('motorista').telas.sort(), ['Calendário', 'Dashboard', 'Meus Documentos'])
  assert.ok(oQueABaseFaz('aux_adm').telas.includes('Caixa'))
  assert.equal(oQueABaseFaz('vendedor').telas.includes('Caixa'), false)
})

test('só o motorista vê apenas o que todos veem', () => {
  assert.equal(oQueABaseFaz('motorista').soOBasico, true)
  for (const base of ['admin_socio', 'aux_adm', 'vendedor', 'mecanico'] as const) assert.equal(oQueABaseFaz(base).soOBasico, false, base)
})
