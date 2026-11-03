// Placar de avaliações: loja mostra avaliação real, vendedor mostra toque, e quem vende sem placa não é cobrado.
import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import type { Placar } from '@/lib/avaliacoes-google/placar'

const { desmontar } = montarDom()
after(desmontar)

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.replaceChildren()
})

async function montar(placar: Placar) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { PlacarAvaliacoes } = await import('./placar-avaliacoes')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const raiz = createRoot(container)
  raizes.push(raiz)
  await act(async () => { raiz.render(React.createElement(PlacarAvaliacoes, { placar })) })
  return container
}

/** Células de cada linha da tabela escolhida pelo rótulo da seção. */
function linhas(container: HTMLElement, rotulo: string) {
  const secao = container.querySelector(`section[aria-label="${rotulo}"]`)!
  return [...secao.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(td => td.textContent?.trim()))
}

const placar: Placar = {
  mes: '2026-11',
  metaPct: 80,
  lojas: [
    { lojaId: 'a', nome: 'Varginha', vendas: 10, toques: 12, novas: 9, desde: '2026-11-01T10:00:00Z', pct: 90, faltam: 0 },
    { lojaId: 'b', nome: 'Itajuba', vendas: 5, toques: 3, novas: 1, desde: '2026-11-04T10:00:00Z', pct: 20, faltam: 3 },
    { lojaId: 'c', nome: 'Lavras', vendas: 4, toques: 0, novas: null, desde: null, pct: null, faltam: 4 },
  ],
  vendedores: [
    { usuarioId: '1', nome: 'Ana', lojaId: 'a', lojaNome: 'Varginha', vendas: 10, toques: 12, temPlaca: true, pct: 120, faltam: 0 },
    { usuarioId: '2', nome: 'Bia', lojaId: 'b', lojaNome: 'Itajuba', vendas: 5, toques: 0, temPlaca: true, pct: 0, faltam: 4 },
    { usuarioId: '3', nome: 'Caio', lojaId: 'c', lojaNome: 'Lavras', vendas: 4, toques: 0, temPlaca: false, pct: 0, faltam: 4 },
  ],
}

test('loja: avaliações novas, % e quanto falta; sem leitura não finge zero; leitura tardia avisa o dia', async () => {
  const c = await montar(placar)
  assert.deepEqual(linhas(c, 'Avaliações novas por loja'), [
    ['Varginha', '10', '9', '90%', '0', '12'],
    ['Itajuba', '5', '1desde 04/11', '20%', '3', '3'],
    ['Lavras', '4', 'sem leitura', '—', '—', '0'],
  ])
})

test('vendedor: toques ÷ vendas, e quem vende sem placa aparece sem cobrança', async () => {
  const c = await montar(placar)
  assert.deepEqual(linhas(c, 'Toques por vendedor'), [
    ['Ana', 'Varginha', '10', '12', '120%', '0'],
    ['Bia', 'Itajuba', '5', '0', '0%', '4'],
    ['Caio', 'Lavras', '4', 'Sem placa'],
  ])
})

test('só fica verde quem chega na meta, e não há vermelho', async () => {
  const c = await montar(placar)
  const verdes = [...c.querySelectorAll('.text-success')].map(e => e.textContent)
  assert.deepEqual(verdes, ['90%', '120%'])
  assert.equal(c.querySelectorAll('.text-destructive').length, 0)
})

test('a tela diz que toque não é avaliação e mostra a meta do grupo', async () => {
  const c = await montar(placar)
  assert.match(c.textContent ?? '', /Toque não é avaliação/)
  assert.match(c.textContent ?? '', /avaliação em 80% das vendas/)
})
