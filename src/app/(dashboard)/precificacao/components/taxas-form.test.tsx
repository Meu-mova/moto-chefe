// Card de taxas na Precificação (#683): recolhido no padrão à vista + 12x, sempre aberto no das taxas.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar } from '@/test/eventos-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

mock.module('../actions', { namedExports: { salvarTaxasAction: async () => {} } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const desmontar of montados.splice(0)) await desmontar() })

const TAXAS = {
  taxasCartao: {}, taxasDebito: {}, taxasLink: {}, taxasFinanciamento: {},
  freteValorKm: '3.00', freteKmGratis: 40, freteValorFixo: '0.00', imposto: '0.06',
}
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)
const abertas = () => botao('Salvar taxas') !== undefined

async function montar(recolhida: boolean) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { TaxasForm } = await import('./taxas-form')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const render = (r: boolean) => act(async () => { root.render(createElement(TaxasForm, { taxas: TAXAS, recolhida: r })) })
  await render(recolhida)
  let montado = true
  montados.push(() => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() }))
  return { render }
}

test('no padrão à vista + 12x o card começa recolhido e abre em "Ver taxas"', async () => {
  await montar(true)
  assert.equal(abertas(), false)
  await clicar(botao('Ver taxas'))
  assert.equal(abertas(), true)
})

test('voltar ao padrão das taxas com a tela aberta deixa o card aberto', async () => {
  const t = await montar(true)
  assert.equal(abertas(), false)
  await t.render(false)
  assert.equal(abertas(), true)
  assert.equal(botao('Ver taxas'), undefined)
})
