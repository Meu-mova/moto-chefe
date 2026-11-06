import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { DADOS_TRANSPORTE_VAZIOS } from '@/lib/notagateway/transporte'
import { TransporteForm } from './transporte-form'

test('mostra o endereço de entrega mesmo sem frete, sem jargão fiscal na tela', () => {
  const html = renderToStaticMarkup(createElement(TransporteForm, {
    dados: { ...DADOS_TRANSPORTE_VAZIOS, modalidade: 'SemOcorrenciaDeTransporte' },
    onChange: () => {},
  }))
  assert.match(html, /Código IBGE do município/)
  assert.match(html, /Modalidade do frete/)
  assert.doesNotMatch(html, /tpOp|frete 9/i)
})

test('a modalidade mostra as 6 opções só com o texto, sem código nem nome da NG, e nenhuma vem escolhida', () => {
  const html = renderToStaticMarkup(createElement(TransporteForm, { dados: DADOS_TRANSPORTE_VAZIOS, onChange: () => {} }))
  const opcoes = [...html.matchAll(/<option[^>]*>([^<]*)<\/option>/g)].map(m => m[1])
  assert.deepEqual(opcoes, [
    'Selecione a modalidade', 'Sem frete', 'Cliente leva com veículo próprio', 'Loja leva com veículo próprio',
    'Cliente contrata e paga a transportadora', 'Loja contrata e paga a transportadora', 'Outra pessoa contrata o frete',
  ])
  assert.match(html, /<option value="" selected="">Selecione a modalidade/)
  assert.doesNotMatch(html, /<option value="[^"]+" selected/)
})
