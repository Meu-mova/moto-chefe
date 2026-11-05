// Diálogo "Editar PIX" de /admin/dados-funcionarios (#680): o que envia, o que mostra quando falha
// e a trava enquanto envia. A action é a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar: desmontarDom } = montarDom()
after(desmontarDom)

type Resposta = { ok: true } | { ok: false; erro: string }
const salvar = mock.fn(async (_id: string, _tipo: string, _chave: string): Promise<Resposta> => ({ ok: true }))
mock.module('../actions', { namedExports: {
  salvarPixDoFuncionarioAction: (id: string, tipo: string, chave: string) => salvar(id, tipo, chave),
} })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  salvar.mock.resetCalls()
  salvar.mock.mockImplementation(async () => ({ ok: true }))
  for (const desmontar of montados.splice(0)) await desmontar()
})

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const DEPOIS_DA_ANIMACAO_MS = 300
const textoDaTela = () => document.body.textContent ?? ''
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)
const clicar = (el: Element | undefined) => el!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
const dialogoAberto = () => document.querySelector('[data-slot="dialog-content"]') !== null
// Campo pelo rótulo visível, não pelo id: o id é detalhe do componente.
const campo = <T extends HTMLElement>(rotulo: RegExp) => {
  const label = [...document.querySelectorAll('label')].find(l => rotulo.test((l.textContent ?? '').trim()))
  return document.getElementById(label!.htmlFor) as T
}
const tipo = () => campo<HTMLSelectElement>(/^Tipo da chave/)
const chave = () => campo<HTMLInputElement>(/^Chave PIX$/)

const GRAVADO = { usuarioId: 'u-1', nome: 'Ana Souza', pixTipo: 'cpf' as const, pixChave: '11144477735' }

async function montar() {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { EditarPixDialog } = await import('./editar-pix-dialog')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(EditarPixDialog, GRAVADO)) })
  const definir = (el: HTMLInputElement | HTMLSelectElement, valor: string, evento: 'input' | 'change') => act(async () => {
    const proto = el instanceof dom.window.HTMLSelectElement ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, valor)
    el.dispatchEvent(new dom.window.Event(evento, { bubbles: true }))
  })
  const clique = (el: Element | undefined, ms = 50) => act(async () => { clicar(el); await esperar(ms) })
  const abrir = () => clique(document.querySelector(`button[aria-label="Editar PIX de ${GRAVADO.nome}"]`)!)
  const escape = () => act(async () => {
    document.querySelector('[data-slot="dialog-content"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await esperar(DEPOIS_DA_ANIMACAO_MS)
  })
  const editar = async (t: string, c: string) => { await definir(tipo(), t, 'change'); await definir(chave(), c, 'input') }
  let montado = true
  const desmontar = () => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() })
  montados.push(desmontar)
  return { act, abrir, clique, escape, editar }
}

test('envia o id da linha com o tipo e a chave editados, e fecha quando grava', async () => {
  const t = await montar()
  await t.abrir()
  assert.equal(tipo().value, 'cpf')
  assert.equal(chave().value, '11144477735')
  await t.editar('email', 'ana@exemplo.com')
  await t.clique(botao('Salvar'), DEPOIS_DA_ANIMACAO_MS)
  assert.deepEqual(salvar.mock.calls.map(c => c.arguments), [['u-1', 'email', 'ana@exemplo.com']])
  assert.ok(!dialogoAberto())
})

test('recusa do servidor aparece no diálogo, que fica aberto para corrigir', async () => {
  salvar.mock.mockImplementation(async () => ({ ok: false, erro: 'Chave PIX não confere com o tipo escolhido.' }))
  const t = await montar()
  await t.abrir()
  await t.clique(botao('Salvar'))
  assert.match(textoDaTela(), /Chave PIX não confere com o tipo escolhido\./)
  assert.ok(dialogoAberto())
  assert.ok(!botao('Salvar')!.disabled)
})

test('falha sem resposta (sessão, rede) mostra mensagem e libera o Salvar', async () => {
  salvar.mock.mockImplementation(async () => { throw new Error('fetch failed') })
  const t = await montar()
  await t.abrir()
  await t.clique(botao('Salvar'))
  assert.match(textoDaTela(), /Não consegui salvar agora\. Tente de novo\./)
  assert.ok(!botao('Salvar')!.disabled)
})

test('trava enquanto envia: Escape não fecha, Salvar e Cancelar desabilitados, duplo clique envia uma vez', async () => {
  let liberar: () => void = () => {}
  salvar.mock.mockImplementation(() => new Promise(ok => { liberar = () => ok({ ok: true }) }))
  const t = await montar()
  await t.abrir()
  await t.act(async () => { clicar(botao('Salvar')); clicar(botao('Salvar')); await esperar(20) })
  assert.equal(salvar.mock.callCount(), 1)
  await t.escape()
  assert.ok(dialogoAberto(), 'Escape não fecha enquanto envia')
  assert.ok(botao('Salvando…')!.disabled, 'Salvar desabilitado')
  assert.ok(botao('Cancelar')!.disabled, 'Cancelar desabilitado')
  await t.act(async () => { liberar(); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.ok(!dialogoAberto())
})

test('cancelar não envia, e reabrir parte do que está gravado', async () => {
  const t = await montar()
  await t.abrir()
  await t.editar('email', 'outra@exemplo.com')
  await t.clique(botao('Cancelar'), DEPOIS_DA_ANIMACAO_MS)
  assert.ok(!dialogoAberto())
  assert.equal(salvar.mock.callCount(), 0)
  await t.abrir()
  assert.equal(tipo().value, 'cpf')
  assert.equal(chave().value, '11144477735')
})
