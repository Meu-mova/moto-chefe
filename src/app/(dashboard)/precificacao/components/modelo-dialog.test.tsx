// Diálogo do modelo na Precificação (#683): o que envia em criar e editar, com e sem o padrão
// 'avista_12x', e a conta que mostra do 12x. A action é a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar } from '@/test/eventos-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

type Resposta = { ok: true; dados: undefined } | { ok: false; erro: string }
const salvar = mock.fn(async (_dados: Record<string, unknown>): Promise<Resposta> => ({ ok: true, dados: undefined }))
mock.module('../actions', { namedExports: { salvarPrecoAction: (d: Record<string, unknown>) => salvar(d) } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  salvar.mock.resetCalls()
  salvar.mock.mockImplementation(async () => ({ ok: true, dados: undefined }))
  for (const desmontar of montados.splice(0)) await desmontar()
})

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const textoDaTela = () => (document.body.textContent ?? '').replace(/ /g, ' ')
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)
const campo = (rotulo: RegExp) => {
  const label = [...document.querySelectorAll('label')].find(l => rotulo.test((l.textContent ?? '').trim()))
  return label ? (document.getElementById(label.htmlFor) as HTMLInputElement | null) : null
}

const GRAVADO = { precId: 'p-1', doCatalogo: true, nome: 'M12X', marca: 'TESTE', valorMinimo: '13990.00', custo: null, valor12x: '15600.00' }

async function montar(props: { modelo?: typeof GRAVADO | null; com12x: boolean }) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ModeloDialog } = await import('./modelo-dialog')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const fechou = mock.fn()
  await act(async () => { root.render(createElement(ModeloDialog, { ...props, onClose: fechou })) })
  let montado = true
  const desmontar = () => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() })
  montados.push(desmontar)
  const clique = async (el: Element | undefined) => { await clicar(el); await act(() => esperar(50)) }
  return { act, clique, fechou }
}

test('editar no padrão à vista + 12x: envia o 12x digitado e mostra a parcela e o desconto', async () => {
  const t = await montar({ modelo: GRAVADO, com12x: true })
  assert.match(textoDaTela(), /12x de R\$ 1\.300,00/)
  assert.match(textoDaTela(), /10% \(R\$ 1\.610,00\)/)
  await digitar(campo(/^Total em 12x/)!, '1680000')
  await t.clique(botao('Salvar'))
  assert.deepEqual(salvar.mock.calls.map(c => c.arguments[0]), [
    { precId: 'p-1', nome: 'M12X', valorMinimo: '13990.00', custo: undefined, valor12x: '16800.00' },
  ])
  assert.equal(t.fechou.mock.callCount(), 1)
})

test('criar no padrão à vista + 12x: envia o 12x junto', async () => {
  const t = await montar({ modelo: null, com12x: true })
  await digitar(campo(/^Nome do modelo/)!, 'NOVO')
  await digitar(campo(/^Valor mínimo PIX/)!, '1000000')
  await digitar(campo(/^Total em 12x/)!, '1200000')
  await t.clique(botao('Definir preço'))
  assert.deepEqual(salvar.mock.calls.map(c => c.arguments[0]), [
    { precId: null, nome: 'NOVO', valorMinimo: '10000.00', custo: undefined, valor12x: '12000.00' },
  ])
})

test('padrão das taxas: o campo do 12x não aparece e o 12x não vai, para não apagar o gravado', async () => {
  const t = await montar({ modelo: GRAVADO, com12x: false })
  assert.equal(campo(/^Total em 12x/), null)
  await t.clique(botao('Salvar'))
  assert.equal(salvar.mock.calls.length, 1)
  assert.equal(salvar.mock.calls[0].arguments[0].valor12x, undefined)
})

test('12x igual ou abaixo do PIX: avisa e deixa salvar', async () => {
  const t = await montar({ modelo: GRAVADO, com12x: true })
  await digitar(campo(/^Total em 12x/)!, '1300000')
  assert.match(textoDaTela(), /O 12x está igual ou abaixo do PIX/)
  await t.clique(botao('Salvar'))
  assert.equal(salvar.mock.calls.length, 1)
})

test('recusa do servidor deixa o diálogo aberto para corrigir', async () => {
  salvar.mock.mockImplementation(async () => ({ ok: false, erro: 'Valor em 12x inválido' }))
  const t = await montar({ modelo: GRAVADO, com12x: true })
  await t.clique(botao('Salvar'))
  assert.equal(t.fechou.mock.callCount(), 0)
  assert.ok(!botao('Salvar')!.disabled)
})

test('criar com só o 12x digitado: mostra a parcela, sem "desconto de 100%" enquanto falta o PIX', async () => {
  await montar({ modelo: null, com12x: true })
  await digitar(campo(/^Total em 12x/)!, '1200000')
  assert.match(textoDaTela(), /12x de R\$ 1\.000,00/)
  assert.doesNotMatch(textoDaTela(), /Desconto do PIX/)
  assert.doesNotMatch(textoDaTela(), /100%/)
})
