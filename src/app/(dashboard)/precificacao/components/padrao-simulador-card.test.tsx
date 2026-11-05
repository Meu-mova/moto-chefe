// Escolha do padrão do simulador na Precificação (#683): duas abas que salvam ao trocar. A action é a
// fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar } from '@/test/eventos-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

type Resposta = { ok: true; dados: undefined } | { ok: false; erro: string }
const salvar = mock.fn(async (_p: string): Promise<Resposta> => ({ ok: true, dados: undefined }))
mock.module('../actions', { namedExports: { salvarPadraoSimuladorAction: (p: string) => salvar(p) } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  salvar.mock.resetCalls()
  salvar.mock.mockImplementation(async () => ({ ok: true, dados: undefined }))
  for (const desmontar of montados.splice(0)) await desmontar()
})

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const aba = (texto: RegExp) => [...document.querySelectorAll('[role="radio"]')].find(b => texto.test(b.textContent ?? '')) as HTMLButtonElement
const marcada = () => [...document.querySelectorAll('[role="radio"][aria-checked="true"]')].map(b => b.textContent)

async function montar(padrao: 'taxas' | 'avista_12x', sem12x = 0) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { PadraoSimuladorCard } = await import('./padrao-simulador-card')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(PadraoSimuladorCard, { padrao, sem12x })) })
  let montado = true
  const desmontar = () => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() })
  montados.push(desmontar)
  return { act }
}

test('trocar de aba salva o padrão escolhido e a aba fica marcada', async () => {
  const t = await montar('taxas')
  assert.deepEqual(marcada(), ['Taxas do cartão'])
  await clicar(aba(/12x fixo/))
  await t.act(() => esperar(20))
  assert.deepEqual(salvar.mock.calls.map(c => c.arguments[0]), ['avista_12x'])
  assert.deepEqual(marcada(), ['À vista + 12x fixo'])
})

test('clicar na aba já marcada não salva de novo', async () => {
  const t = await montar('avista_12x')
  await clicar(aba(/12x fixo/))
  await t.act(() => esperar(20))
  assert.equal(salvar.mock.calls.length, 0)
})

test('recusa do servidor volta a aba de antes e mostra a frase', async () => {
  salvar.mock.mockImplementation(async () => ({ ok: false, erro: 'Sem permissão' }))
  const t = await montar('taxas')
  await clicar(aba(/12x fixo/))
  await t.act(() => esperar(20))
  assert.deepEqual(marcada(), ['Taxas do cartão'])
  assert.match(document.body.textContent ?? '', /Sem permissão/)
})

test('enquanto salva, as duas abas ficam travadas', async () => {
  let liberar: (r: Resposta) => void = () => {}
  salvar.mock.mockImplementation(() => new Promise<Resposta>(r => { liberar = r }))
  const t = await montar('taxas')
  await clicar(aba(/12x fixo/))
  assert.ok(aba(/12x fixo/).disabled && aba(/Taxas/).disabled)
  await t.act(async () => { liberar({ ok: true, dados: undefined }); await esperar(20) })
  assert.ok(!aba(/12x fixo/).disabled && !aba(/Taxas/).disabled)
})

test('no padrão novo, avisa quantos modelos ativos estão sem 12x', async () => {
  await montar('avista_12x', 2)
  assert.match(document.body.textContent ?? '', /2 modelos ativos estão sem valor em 12x/)
})
