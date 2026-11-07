// Lista da /mensalidade (#773): se a leitura das mensalidades falhou, a tela diz que não deu para
// carregar, e não "Nenhuma mensalidade em aberto." (o cliente acharia que está em dia).
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)
const acao = mock.module('./actions', { namedExports: { linkPagamentoAction: async () => ({ ok: true, url: '' }) } })
after(() => acao.restore())

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const desmontar of montados.splice(0)) await desmontar() })

async function textoDaLista(props: { paga: boolean; linhas: []; hoje: string; leituraFalhou: boolean }) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ListaMensalidades } = await import('./lista')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(ListaMensalidades, props)) })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
  return container.textContent ?? ''
}

test('leitura que falhou mostra o aviso de erro, não "Nenhuma mensalidade em aberto."', async () => {
  const texto = await textoDaLista({ paga: true, linhas: [], hoje: '2026-11-07', leituraFalhou: true })
  assert.ok(texto.includes('Não deu para carregar as mensalidades agora.'), `texto da lista: ${texto}`)
  assert.ok(!texto.includes('Nenhuma mensalidade em aberto.'))
})

test('leitura que deu certo e sem mensalidade em aberto continua dizendo que não há nenhuma', async () => {
  const texto = await textoDaLista({ paga: true, linhas: [], hoje: '2026-11-07', leituraFalhou: false })
  assert.equal(texto, 'Nenhuma mensalidade em aberto.')
})
