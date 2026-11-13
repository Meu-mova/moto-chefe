// Janelas que aparecem ao entrar (#883): Novidades da versão antes dos comunicados, nunca as duas
// juntas, e só saem pelo botão. A action do comunicado é a fronteira de fora; o resto roda de verdade.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { apertarEscape, botao, clicar, DEPOIS_DA_ANIMACAO_MS, esperar, montarDialogo, textoDaTela } from '@/test/dialogo-em-tela'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

const marcarComoLido = mock.fn(async (_id: string) => undefined)
mock.module('../admin/comunicados/actions', { namedExports: { marcarComoLidoAction: (id: string) => marcarComoLido(id) } })

const COMUNICADOS = [
  { id: 'c1', titulo: 'Reunião de sexta', conteudo: 'Às 9h na loja.' },
  { id: 'c2', titulo: 'Inventário', conteudo: 'Conferir o estoque.' },
]

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  marcarComoLido.mock.resetCalls()
  for (const desmontar of montados.splice(0)) await desmontar()
})

const janelasAbertas = () => document.querySelectorAll('[data-slot="dialog-content"]').length

/** O que o navegador dispara num clique no fundo escuro, fora da janela. */
async function clicarFora(act: (f: () => Promise<void>) => Promise<void>) {
  const fundo = document.querySelector('[data-slot="dialog-overlay"]') ?? document.body
  await act(async () => {
    for (const tipo of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      fundo.dispatchEvent(new window.MouseEvent(tipo, { bubbles: true, cancelable: true, button: 0 }))
    }
    await esperar(DEPOIS_DA_ANIMACAO_MS)
  })
}

async function montarComunicados() {
  const { ComunicadoModal } = await import('./comunicado-modal')
  const t = await montarDialogo(ComunicadoModal, { comunicados: COMUNICADOS })
  montados.push(t.desmontar)
  return t
}

test('comunicado: Esc não fecha', async () => {
  const t = await montarComunicados()
  await t.act(async () => { apertarEscape(); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.equal(janelasAbertas(), 1)
  assert.match(textoDaTela(), /Reunião de sexta/)
})

test('comunicado: clique fora não fecha', async () => {
  const t = await montarComunicados()
  await clicarFora(t.act)
  assert.equal(janelasAbertas(), 1)
  assert.match(textoDaTela(), /Reunião de sexta/)
})

test('comunicado: LIDO marca como lido e passa ao próximo', async () => {
  const t = await montarComunicados()
  assert.match(textoDaTela(), /1 de 2/)
  await t.clique('LIDO')
  assert.deepEqual(marcarComoLido.mock.calls.map(c => c.arguments[0]), ['c1'])
  assert.match(textoDaTela(), /Inventário/)
  assert.match(textoDaTela(), /2 de 2/)
})
