// Desarquivar pelo RADAR (#691): o botão abre o diálogo, o motivo é obrigatório, envia uma vez e
// trava enquanto envia. A action e o toast são a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { ResultadoAction } from '@/lib/resultado-action'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar: desmontarDom } = montarDom()
after(desmontarDom)

const OK: ResultadoAction<{ desarquivadas: number }> = { ok: true, dados: { desarquivadas: 1 } }
const api = {
  desarquivar: mock.fn(async (_id: string, _motivo: string): Promise<ResultadoAction<{ desarquivadas: number }>> => OK),
  sucesso: mock.fn((_texto: string) => {}),
}
mock.module('../../estoque/arquivar-actions', { namedExports: {
  desarquivarMotoAction: (id: string, motivo: string) => api.desarquivar(id, motivo),
} })
mock.module('sonner', { namedExports: { toast: { success: (t: string) => api.sucesso(t), error: () => {} } } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const m of Object.values(api)) m.mock.resetCalls()
  api.desarquivar.mock.mockImplementation(async () => OK)
  for (const desmontar of montados.splice(0)) await desmontar()
})

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const DEPOIS_DA_ANIMACAO_MS = 300
const textoDaTela = () => document.body.textContent ?? ''
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)
const clicar = (el: Element | null | undefined) => { assert.ok(el, 'elemento não encontrado'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) }
const dialogoAberto = () => document.querySelector('[data-slot="dialog-content"]') !== null

async function montar() {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { DesarquivarMoto } = await import('./desarquivar-moto')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(DesarquivarMoto, { motoId: 'm-1', chassi: 'TESTE00ARQ000001' })) })
  const escrever = (valor: string) => act(async () => {
    const campo = document.getElementById('motivo-desarquivar') as HTMLTextAreaElement
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(campo, valor)
    campo.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  const clique = (texto: string, ms = 50) => act(async () => { clicar(botao(texto)); await esperar(ms) })
  let montado = true
  const desmontar = () => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() })
  montados.push(desmontar)
  return { act, escrever, clique }
}

test('abre pelo botão com o chassi; sem motivo (ou só espaços) não envia', async () => {
  const t = await montar()
  assert.equal(dialogoAberto(), false)
  await t.clique('Desarquivar')
  assert.ok(dialogoAberto())
  assert.match(textoDaTela(), /TESTE00ARQ000001/)
  // Moto do golpe (vendida sem venda) não volta ao Showroom: o diálogo não promete isso (#691, decisão b).
  assert.match(textoDaTela(), /A moto volta às listas e às buscas do MOVA\./)
  assert.doesNotMatch(textoDaTela(), /Showroom/)
  const enviar = () => [...document.querySelectorAll('[data-slot="dialog-content"] button')].find(b => b.textContent?.trim() === 'Desarquivar') as HTMLButtonElement
  assert.ok(enviar().disabled)
  await t.escrever('   ')
  assert.ok(enviar().disabled)
  await t.escrever('Achamos o dono')
  assert.equal(enviar().disabled, false)
})

test('controle do Escape: fora do envio, Escape fecha o diálogo', async () => {
  const t = await montar()
  await t.clique('Desarquivar')
  assert.ok(dialogoAberto())
  await t.act(async () => { document.querySelector('[data-slot="dialog-content"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.equal(dialogoAberto(), false)
})

test('envia o id e o motivo uma vez, trava enquanto envia, e no fim avisa "Moto desarquivada" e fecha', async () => {
  let liberar: () => void = () => {}
  api.desarquivar.mock.mockImplementation(() => new Promise(ok => { liberar = () => ok(OK) }))
  const t = await montar()
  await t.clique('Desarquivar')
  await t.escrever('Achamos o dono')
  const enviar = () => [...document.querySelectorAll('[data-slot="dialog-content"] button')].find(b => b.textContent?.trim() === 'Desarquivar')
  await t.act(async () => { clicar(enviar()); clicar(enviar()); await esperar(20) })
  assert.deepEqual(api.desarquivar.mock.calls.map(c => c.arguments), [['m-1', 'Achamos o dono']])
  assert.ok(botao('Desarquivando...')!.disabled, 'o botão de enviar trava')
  assert.ok(botao('Cancelar')!.disabled)
  assert.ok((document.querySelector('[aria-label="Fechar"]') as HTMLButtonElement).disabled)
  await t.act(async () => { document.querySelector('[data-slot="dialog-content"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.ok(dialogoAberto(), 'Escape não fecha enquanto envia')
  await t.act(async () => { liberar(); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.deepEqual(api.sucesso.mock.calls.map(c => c.arguments[0]), ['Moto desarquivada'])
  assert.equal(dialogoAberto(), false)
})

test('recusa do servidor aparece no diálogo, que continua aberto e deixa tentar de novo', async () => {
  api.desarquivar.mock.mockImplementation(async () => ({ ok: false, erro: 'Moto não encontrada' }))
  const t = await montar()
  await t.clique('Desarquivar')
  await t.escrever('Achamos o dono')
  await t.act(async () => { clicar([...document.querySelectorAll('[data-slot="dialog-content"] button')].find(b => b.textContent?.trim() === 'Desarquivar')); await esperar(50) })
  assert.equal(document.querySelector('[role="alert"]')?.textContent, 'Moto não encontrada')
  assert.ok(dialogoAberto())
  assert.equal(api.sucesso.mock.callCount(), 0)
  assert.equal(botao('Cancelar')!.disabled, false)
})
