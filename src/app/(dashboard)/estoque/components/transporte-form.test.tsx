import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DADOS_TRANSPORTE_VAZIOS } from '@/lib/notagateway/transporte'
import { TransporteForm } from './transporte-form'

test('mostra o endereço de entrega mesmo com o frete "sem transporte", sem jargão fiscal na tela', () => {
  const html = renderToStaticMarkup(createElement(TransporteForm, {
    dados: { ...DADOS_TRANSPORTE_VAZIOS, modalidade: 'SemTransporte' },
    onChange: () => {},
  }))
  assert.match(html, /Código IBGE do município/)
  assert.match(html, /Modalidade do frete/)
  assert.doesNotMatch(html, /tpOp|frete 9/i)
})
