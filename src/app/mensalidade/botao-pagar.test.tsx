// "Pagar" da /mensalidade (#773): quando o link não sai, o motivo aparece na tela. A /mensalidade
// fica fora do layout do painel; o teste monta o layout dela com o botão e o toast de verdade.
// Só a Server Action é a fronteira de fora.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { LINK_INDISPONIVEL } from '@/lib/mensalidade/regras'

const { dom, desmontar: desmontarDom } = montarDom()
after(desmontarDom)
// O Toaster segue o tema do sistema e o JSDOM não tem matchMedia.
const janela = dom.window as unknown as { matchMedia?: unknown }
janela.matchMedia = () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {}, addListener: () => {}, removeListener: () => {} })
after(() => { delete janela.matchMedia })

const ERRO = LINK_INDISPONIVEL
const acao = mock.module('./actions', { namedExports: { linkPagamentoAction: async () => ({ ok: false, erro: ERRO }) } })
after(() => acao.restore())

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const desmontar of montados.splice(0)) await desmontar() })

async function montarTela() {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { default: MensalidadeLayout } = await import('./layout')
  const { BotaoPagar } = await import('./botao-pagar')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(MensalidadeLayout, null, createElement(BotaoPagar, { mensalidadeId: 'm-1' }))) })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
  return { act }
}

test('Pagar sem link: o motivo devolvido pela action aparece na tela', async () => {
  const { act } = await montarTela()
  const pagar = [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === 'Pagar')
  assert.ok(pagar, 'botão Pagar não encontrado')
  await act(async () => { pagar.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  const naTela = () => (document.body.textContent ?? '').includes(ERRO)
  for (let i = 0; i < 50 && !naTela(); i++) await act(async () => { await new Promise(r => setTimeout(r, 10)) })
  assert.ok(naTela(), `erro fora da tela: ${document.body.textContent}`)
})
