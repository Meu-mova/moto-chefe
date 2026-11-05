// Histórico das faixas (#655): o que a lista mostra e a consulta do resultado de quem está pendente.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { ResultadoAction } from '@/lib/resultado-action'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar: desmontarDom } = montarDom()
after(desmontarDom)

const router = { refresh: mock.fn() }
mock.module('next/navigation', { namedExports: { useRouter: () => router } })
const consultar = mock.fn(async (_id: string): Promise<ResultadoAction<{ situacao: string }>> => ({ ok: true, dados: { situacao: 'autorizada' } }))
mock.module('../actions', { namedExports: { consultarFaixaAction: (id: string) => consultar(id) } })

const FAIXAS = [
  { id: 'f1', serie: '3', numeroInicial: 16, numeroFinal: 24, justificativa: 'Quebra na sequencia', situacao: 'pendente' as const, motivoStatus: null, protocolo: null, criadoEm: new Date('2026-11-04T15:00:00Z') },
  { id: 'f2', serie: '3', numeroInicial: 30, numeroFinal: 30, justificativa: 'Outra quebra de teste', situacao: 'negada' as const, motivoStatus: 'Faixa já utilizada', protocolo: null, criadoEm: new Date('2026-11-03T15:00:00Z') },
  { id: 'f3', serie: '3', numeroInicial: 40, numeroFinal: 50, justificativa: 'Mais uma quebra de teste', situacao: 'autorizada' as const, motivoStatus: null, protocolo: '135260000001', criadoEm: new Date('2026-11-02T15:00:00Z') },
]
const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  consultar.mock.resetCalls(); router.refresh.mock.resetCalls()
  consultar.mock.mockImplementation(async () => ({ ok: true, dados: { situacao: 'autorizada' } }))
  for (const d of montados.splice(0)) await d()
})
const textoDaTela = () => document.body.textContent ?? ''
const botoes = () => [...document.querySelectorAll('button')]

async function montar(faixas = FAIXAS) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { HistoricoFaixas } = await import('./historico-faixas')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(HistoricoFaixas, { faixas })) })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
  return act
}

test('sem faixa pedida a seção não aparece', async () => {
  await montar([])
  assert.equal(textoDaTela(), '')
})

test('lista série, números, situação, motivo e protocolo; só a pendente tem "Consultar resultado"', async () => {
  await montar()
  assert.match(textoDaTela(), /números 16 a 24/)
  assert.match(textoDaTela(), /Faixa já utilizada/)
  assert.match(textoDaTela(), /Protocolo 135260000001/)
  assert.equal(botoes().filter(b => b.textContent?.includes('Consultar resultado')).length, 1)
})

test('consultar pergunta pelo id da faixa pendente e atualiza a tela; recusa aparece', async () => {
  const act = await montar()
  const clicar = () => act(async () => { botoes().find(b => b.textContent?.includes('Consultar resultado'))!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  await clicar()
  assert.deepEqual(consultar.mock.calls.map(c => c.arguments[0]), ['f1'])
  assert.equal(router.refresh.mock.callCount(), 1)
  consultar.mock.mockImplementationOnce(async () => ({ ok: false, erro: 'Inutilização não encontrada' }))
  await clicar()
  assert.match(textoDaTela(), /Inutilização não encontrada/)
  assert.equal(router.refresh.mock.callCount(), 1)
})
