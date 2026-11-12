// Simulador no padrão à vista + 12x (#683): o que a tela mostra para um modelo, com e sem 12x, com o
// frete calculado, e o que vai para a impressão. Frete (action) e janela de impressão são a fronteira de fora.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar } from '@/test/eventos-dom'

const { dom, desmontar: desmontarDom } = montarDom()
after(desmontarDom)

const FRETE = { ok: true as const, distanciaKmIda: 42.1, kmIdaEVolta: 84.2, custo: 168, gratis: false, endereco: 'Rua X' }
const simularFrete = mock.fn(async (_loja: string, _cep: string) => FRETE)
mock.module('../actions', { namedExports: { simularFreteAction: (l: string, c: string) => simularFrete(l, c) } })

// Janela de impressão: guarda o blob que iria para o papel e quantas vezes a janela abriu.
const impressos: string[] = []
const blobs = new Map<string, Blob>()
Object.assign(dom.window.URL, {
  createObjectURL: (b: Blob) => { blobs.set('blob:teste', b); return 'blob:teste' },
  revokeObjectURL: () => {},
})
dom.window.open = (() => { impressos.push('aberta'); return null }) as typeof dom.window.open
const globaisAntes = { URL: globalThis.URL, Blob: globalThis.Blob }
Object.assign(globalThis, { URL: dom.window.URL, Blob: dom.window.Blob })
after(() => { Object.assign(globalThis, globaisAntes) })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  simularFrete.mock.resetCalls()
  impressos.length = 0
  blobs.clear()
  for (const desmontar of montados.splice(0)) await desmontar()
})

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const texto = () => (document.body.textContent ?? '').replace(/ /g, ' ')
const botao = (t: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === t)
const LOJAS = [{ id: 'loja-a', nome: 'Loja A', temCep: true }]

async function montar(valor12x: string | null) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ResultadoAvista12x } = await import('./simulador-avista-12x')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const modelo = { id: 'm1', nome: 'Scooter 3000', valorMinimo: '13990.00', valor12x, imagemUrl: null }
  await act(async () => {
    root.render(createElement(ResultadoAvista12x, { modelo, lojasFrete: LOJAS, isAdmin: false, lojaUsuarioId: 'loja-a' }))
  })
  let montado = true
  montados.push(() => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() }))
  const calcularFrete = async () => {
    const cep = document.querySelector('input[inputmode="numeric"]') as HTMLInputElement
    await digitar(cep, '37550000')
    await act(async () => { cep.dispatchEvent(new dom.window.FocusEvent('focusout', { bubbles: true })); await esperar(20) })
  }
  return { act, calcularFrete }
}

test('com 12x: PIX em destaque, desconto e "ou no cartão 12x de"', async () => {
  await montar('15600.00')
  assert.match(texto(), /À vista no PIX ou dinheiro\s*R\$ 13\.990,00/)
  assert.match(texto(), /10% de desconto, economia de R\$ 1\.610,00 sobre o 12x/)
  assert.match(texto(), /ou no cartão\s*12x de R\$ 1\.300,00\s*total R\$ 15\.600,00/)
})

test('sem 12x: só o PIX e o aviso para definir na Precificação', async () => {
  await montar(null)
  assert.match(texto(), /R\$ 13\.990,00/)
  assert.match(texto(), /Sem valor em 12x para este modelo\. Defina na Precificação\./)
  assert.doesNotMatch(texto(), /12x de/)
})

test('frete calculado: linhas "PIX + frete" e "12x + frete"', async () => {
  const t = await montar('15600.00')
  assert.doesNotMatch(texto(), /PIX \+ frete/)
  await t.calcularFrete()
  assert.deepEqual(simularFrete.mock.calls.map(c => c.arguments), [['loja-a', '37550000']])
  assert.match(texto(), /PIX \+ frete\s*R\$ 14\.158,00/)
  assert.match(texto(), /12x \+ frete\s*12x de R\$ 1\.314,00/)
})

test('frete sem 12x: só "PIX + frete"', async () => {
  const t = await montar(null)
  await t.calcularFrete()
  assert.match(texto(), /PIX \+ frete\s*R\$ 14\.158,00/)
  assert.doesNotMatch(texto(), /12x \+ frete/)
})

test('imprimir abre a janela com o papel do modelo, os dois valores e o frete', async () => {
  const t = await montar('15600.00')
  await t.calcularFrete()
  await clicar(botao('Imprimir / Salvar PDF'))
  await t.act(() => esperar(10))
  assert.deepEqual(impressos, ['aberta'])
  const html = (await blobs.get('blob:teste')!.text()).replace(/ /g, ' ')
  assert.match(html, /Scooter 3000/)
  assert.match(html, /12x de R\$ 1\.300,00/)
  assert.match(html, /84,2 km ida e volta/)
  assert.match(html, /12x \+ frete: 12x de R\$ 1\.314,00/)
})
