// AcoesOuArquivada (#688): com moto arquivada, o que vier dentro (na página, a barra de ações) não
// aparece e no lugar vem o aviso com data, quem arquivou e o motivo; sem arquivada, aparece o de dentro.
// Que a página põe a barra inteira aqui e deixa Editar e Corrigir preço fora se confere no navegador.
import { createElement } from 'react'
import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const desmontar of montados.splice(0)) await desmontar() })

const BARRA = createElement('div', { 'data-testid': 'barra' }, 'Vender Garantia Transferir Montar')

async function montar(arquivada: { em: Date; por: string | null; motivo: string | null } | null) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { AcoesOuArquivada } = await import('./acoes-ou-arquivada')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(AcoesOuArquivada, { arquivada, children: BARRA })) })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
  return container
}

test('moto arquivada: sem a barra de ações; aviso com data em Brasília, quem e motivo', async () => {
  // 02h UTC do dia 05 = 23h do dia 04 em Brasília.
  const tela = await montar({ em: new Date('2026-11-05T02:00:00Z'), por: 'Sócio Teste', motivo: 'Moto do golpe do link de pagamento' })
  assert.equal(tela.querySelector('[data-testid="barra"]'), null)
  const texto = tela.textContent ?? ''
  assert.match(texto, /Moto arquivada em 04\/11\/2026 por Sócio Teste/)
  assert.match(texto, /Motivo: Moto do golpe do link de pagamento/)
  assert.match(texto, /desarquive pelo RADAR/)
})

test('moto arquivada sem quem arquivou registrado não inventa nome', async () => {
  const texto = (await montar({ em: new Date('2026-11-05T15:00:00Z'), por: null, motivo: 'x' })).textContent ?? ''
  assert.match(texto, /Moto arquivada em 05\/11\/2026\./)
  assert.doesNotMatch(texto, / por /)
})

test('moto não arquivada: a barra aparece como hoje, sem aviso', async () => {
  const tela = await montar(null)
  assert.ok(tela.querySelector('[data-testid="barra"]'))
  assert.doesNotMatch(tela.textContent ?? '', /arquivada/i)
})
