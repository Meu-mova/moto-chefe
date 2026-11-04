import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DADOS_TRANSPORTE_VAZIOS } from '@/lib/notagateway/transporte'
import { TransporteForm } from './transporte-form'

test('tpOp 2 mostra endereço mesmo com frete 9', () => {
  const html = renderToStaticMarkup(createElement(TransporteForm, {
    dados: { ...DADOS_TRANSPORTE_VAZIOS, modalidade: 'SemTransporte' },
    exigeEntrega: true,
    onChange: () => {},
  }))
  assert.match(html, /Código IBGE do município/)
  assert.match(html, /mesmo com frete 9/i)
})

test('sem tpOp 2 mostra modalidade e omite os campos de entrega', () => {
  const html = renderToStaticMarkup(createElement(TransporteForm, {
    dados: { ...DADOS_TRANSPORTE_VAZIOS, modalidade: 'PorContaDoDestinatario' },
    exigeEntrega: false,
    onChange: () => {},
  }))
  assert.match(html, /Modalidade do frete/)
  assert.doesNotMatch(html, /Código IBGE do município/)
})
