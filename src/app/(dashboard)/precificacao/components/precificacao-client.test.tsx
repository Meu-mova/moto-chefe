// Tabela (desktop) e lista (celular) de modelos da Precificação (#683): quem conta como "sem valor em 12x"
// e o que cada linha mostra no padrão à vista + 12x. As actions são a fronteira de fora.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

const nada = async () => ({ ok: true, dados: undefined })
mock.module('../actions', { namedExports: {
  salvarTaxasAction: nada, salvarPrecoAction: nada, salvarPadraoSimuladorAction: nada, toggleAtivoAction: nada,
  excluirModeloAction: nada, previaImportacaoAction: nada, importarPrecosAction: nada,
} })

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const desmontar of montados.splice(0)) await desmontar() })

const TAXAS = {
  taxasCartao: {}, taxasDebito: {}, taxasLink: {}, taxasFinanciamento: {},
  freteValorKm: '3.00', freteKmGratis: 40, freteValorFixo: '0.00', imposto: '0.06',
}
const modelo = (id: string, extra: Partial<Record<string, unknown>>) => ({
  id, precId: `p-${id}`, doCatalogo: true, nome: id, marca: null, valorMinimo: '10000.00', custo: null,
  valor12x: null, ativo: true, estoqueDisponivel: 0, ...extra,
})
const MODELOS = [
  modelo('COM12X', { valor12x: '12000.00' }),
  modelo('ATIVOSEM', {}),
  modelo('INATIVOSEM', { ativo: false }),
  modelo('SEMPRECO', { precId: null, valorMinimo: null }),
]

async function montar(padraoSimulador: 'taxas' | 'avista_12x') {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { PrecificacaoClient } = await import('./precificacao-client')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(PrecificacaoClient, { taxas: TAXAS, modelos: MODELOS, grupoNome: 'Grupo A', padraoSimulador }))
  })
  let montado = true
  montados.push(() => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() }))
}

const texto = (el: Element | null | undefined) => (el?.textContent ?? '').replace(/ /g, ' ')
const linhaDaTabela = (nome: string) => [...document.querySelectorAll('tbody tr')].find(tr => texto(tr.querySelector('td')).startsWith(nome))
const itemDaLista = (nome: string) => [...document.querySelectorAll('ul[aria-label="Modelos"] > li')].find(li => texto(li).startsWith(nome))

test('só o modelo com preço, ativo e sem 12x conta como "sem valor em 12x"', async () => {
  await montar('avista_12x')
  assert.match(texto(document.body), /1 ativo sem valor em 12x/)
  assert.match(texto(document.body), /1 modelo ativo está sem valor em 12x/)
})

test('tabela: total e parcela de quem tem 12x; "Sem valor" só no ativo com preço', async () => {
  await montar('avista_12x')
  assert.match(texto(linhaDaTabela('COM12X')), /R\$ 12\.000,00\s*12x de R\$ 1\.000,00/)
  assert.match(texto(linhaDaTabela('ATIVOSEM')), /Sem valor/)
  assert.doesNotMatch(texto(linhaDaTabela('INATIVOSEM')), /Sem valor/)
  assert.doesNotMatch(texto(linhaDaTabela('SEMPRECO')), /Sem valor/)
})

test('lista do celular: nome, PIX e "12x de" ou "Sem valor em 12x"', async () => {
  await montar('avista_12x')
  assert.equal(document.querySelectorAll('ul[aria-label="Modelos"] > li').length, 4)
  assert.match(texto(itemDaLista('COM12X')), /R\$ 10\.000,00/)
  assert.match(texto(itemDaLista('COM12X')), /12x de R\$ 1\.000,00/)
  assert.match(texto(itemDaLista('ATIVOSEM')), /Sem valor em 12x/)
  assert.doesNotMatch(texto(itemDaLista('INATIVOSEM')), /Sem valor em 12x/)
  assert.match(texto(itemDaLista('SEMPRECO')), /Definir preço/)
})

test('padrão das taxas: sem coluna, sem contagem e sem 12x na lista', async () => {
  await montar('taxas')
  assert.doesNotMatch(texto(document.body), /sem valor em 12x/i)
  assert.ok(![...document.querySelectorAll('th')].some(th => /12x/.test(texto(th))))
  assert.doesNotMatch(texto(itemDaLista('COM12X')), /12x/)
})
