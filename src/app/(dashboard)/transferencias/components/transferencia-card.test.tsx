// Botão Imprimir no card de transferência (#877).
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import type { TransferenciaCardData } from './transferencia-card'

const { dom, desmontar } = montarDom()
after(desmontar)

const nada = async () => {}
mock.module('../actions', { namedExports: { aceitarTransferenciaAction: nada, recusarTransferenciaAction: nada } })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  mock.restoreAll()
})

const pendente: TransferenciaCardData = {
  id: 'transf-877',
  status: 'pendente',
  dataSolicitacao: '2026-11-13T12:12:00.000Z',
  dataResposta: null,
  observacao: null,
  chassi: 'LYDAE0000T0000001',
  modelo: 'JETMAX',
  cor: 'CINZA',
  motoStatus: 'disponivel',
  lojaOrigemId: 'loja-origem',
  lojaOrigemNome: 'Loja Centro',
  lojaDestinoId: 'loja-destino',
  lojaDestinoNome: 'Loja Norte',
  solicitadoPorNome: 'Ana Exemplo',
  respondidoPorNome: null,
}

async function montar(t: TransferenciaCardData, papel: string, lojaIdUsuario: string | null) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { TransferenciaCard } = await import('./transferencia-card')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const raiz = createRoot(container)
  raizes.push(raiz)
  await act(async () => { raiz.render(React.createElement(TransferenciaCard, { transferencia: t, papel, lojaIdUsuario })) })
}

const botoes = () => [...document.querySelectorAll('button')]
const textos = () => botoes().map(b => b.textContent?.trim())
const botao = (texto: string) => botoes().find(b => b.textContent?.trim() === texto)

test('pendente para o aux_adm do destino: Aceitar, Recusar e Imprimir na mesma linha', async () => {
  await montar(pendente, 'aux_adm', 'loja-destino')
  assert.deepEqual(textos(), ['Aceitar', 'Recusar', 'Imprimir'])
  const linha = botao('Aceitar')?.parentElement
  assert.ok(linha && linha === botao('Imprimir')?.parentElement, 'os três dividem a mesma linha')
})

for (const status of ['aceita', 'recusada'] as const) {
  test(`histórico (${status}): só Imprimir`, async () => {
    await montar({ ...pendente, status, respondidoPorNome: 'Bruno Exemplo', dataResposta: '2026-11-13T13:40:00.000Z' }, 'admin_socio', null)
    assert.deepEqual(textos(), ['Imprimir'])
  })
}

test('pendente que o usuário não responde (vendedor da origem): só Imprimir', async () => {
  await montar(pendente, 'vendedor', 'loja-origem')
  assert.deepEqual(textos(), ['Imprimir'])
})

test('Imprimir abre o comprovante da transferência numa aba nova', async () => {
  const aberto = mock.method(dom.window, 'open', () => null)
  await montar(pendente, 'vendedor', 'loja-origem')
  const { act } = await import('react')
  await act(async () => { botao('Imprimir')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) })
  assert.deepEqual(aberto.mock.calls.map(c => c.arguments), [['/transferencias/transf-877/imprimir', '_blank']])
})
