// Janelas que aparecem ao entrar (#883): Novidades da versão antes dos comunicados, nunca as duas
// juntas, e só saem pelo botão. A action do comunicado é a fronteira de fora; o resto roda de verdade.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { apertarEscape, DEPOIS_DA_ANIMACAO_MS, esperar, montarDialogo, textoDaTela } from '@/test/dialogo-em-tela'
import { NOVIDADES_DA_VERSAO } from '@/lib/novidades/lista'
import { novidadeParaMostrar } from '@/lib/novidades/regra'
import type { NovidadeDaVersao } from '@/lib/novidades/tipos'

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
  for (const nome of Object.keys(cookiesDoNavegador())) document.cookie = `${nome}=; path=/; max-age=0`
})

/** Os cookies que o navegador mandaria ao servidor no próximo pedido. */
const cookiesDoNavegador = (): Record<string, string> =>
  Object.fromEntries(document.cookie.split('; ').filter(Boolean).map(c => [c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]))

const NOVIDADE: NovidadeDaVersao = {
  versao: '1.36.0',
  data: '2026-11-13',
  novidades: [{ titulo: 'Janela de novidades', texto: 'Mostra o que mudou.' }],
  correcoes: [{ titulo: 'Busca de clientes', texto: 'Voltou a achar pelo CPF.' }],
}

const janelasAbertas = () => document.querySelectorAll('[data-slot="dialog-content"]').length

/** O que o navegador dispara num clique no fundo escuro, fora da janela. */
async function clicarFora(act: (f: () => Promise<void>) => Promise<void>) {
  const fundo = document.querySelector('[data-slot="dialog-overlay"]')
  assert.ok(fundo, 'fundo da janela não encontrado')
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

async function montarAvisos(novidade: NovidadeDaVersao | null, usuarioId = 'pessoa-a') {
  const { AvisosDoAcesso } = await import('./avisos-do-acesso')
  const t = await montarDialogo(AvisosDoAcesso, { novidade, usuarioId, comunicados: COMUNICADOS })
  montados.push(t.desmontar)
  return t
}

test('novidade vem antes dos comunicados, sozinha, com versão, data, seções e itens', async () => {
  await montarAvisos(NOVIDADE)
  assert.equal(janelasAbertas(), 1)
  const texto = textoDaTela()
  assert.match(texto, /Novidades do MOVA, versão 1\.36\.0/)
  assert.match(texto, /13\/11\/2026/)
  const secoes = [...document.querySelectorAll('[data-slot="dialog-content"] h3')].map(h => h.textContent)
  assert.deepEqual(secoes, ['Novidades', 'Correções'])
  assert.match(texto, /Janela de novidades/)
  assert.match(texto, /Voltou a achar pelo CPF\./)
  assert.doesNotMatch(texto, /Reunião de sexta/)
})

test('seção sem item não aparece', async () => {
  await montarAvisos({ ...NOVIDADE, novidades: undefined })
  const secoes = [...document.querySelectorAll('[data-slot="dialog-content"] h3')].map(h => h.textContent)
  assert.deepEqual(secoes, ['Correções'])
})

test('Entendi grava o cookie da pessoa com a versão e passa aos comunicados, sem marcar nenhum como lido', async () => {
  const t = await montarAvisos(NOVIDADE, 'pessoa-a')
  await t.clique('Entendi')
  assert.deepEqual(cookiesDoNavegador(), { 'novidade-vista-pessoa-a': '1.36.0' })
  assert.equal(janelasAbertas(), 1)
  assert.match(textoDaTela(), /Reunião de sexta/)
  assert.doesNotMatch(textoDaTela(), /Novidades do MOVA/)
  assert.equal(marcarComoLido.mock.callCount(), 0)
})

test('no próximo acesso, a regra com o cookie gravado não mostra mais para a pessoa, e a outra continua vendo', async () => {
  const t = await montarAvisos(NOVIDADES_DA_VERSAO[0], 'pessoa-a')
  await t.clique('Entendi')
  const cookies = cookiesDoNavegador()
  const versaoVista = (usuarioId: string) => cookies[`novidade-vista-${usuarioId}`] ?? null
  assert.equal(novidadeParaMostrar(NOVIDADES_DA_VERSAO, 'aux_adm', versaoVista('pessoa-a')), null)
  assert.equal(novidadeParaMostrar(NOVIDADES_DA_VERSAO, 'aux_adm', versaoVista('pessoa-b'))?.versao, NOVIDADES_DA_VERSAO[0].versao)
})

test('novidade: Esc e clique fora não fecham', async () => {
  const t = await montarAvisos(NOVIDADE)
  await t.act(async () => { apertarEscape(); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  await clicarFora(t.act)
  assert.equal(janelasAbertas(), 1)
  assert.match(textoDaTela(), /Novidades do MOVA, versão 1\.36\.0/)
  assert.deepEqual(cookiesDoNavegador(), {})
})

test('sem novidade, os comunicados aparecem direto', async () => {
  await montarAvisos(null)
  assert.equal(janelasAbertas(), 1)
  assert.match(textoDaTela(), /Reunião de sexta/)
  assert.doesNotMatch(textoDaTela(), /Novidades do MOVA/)
})

test('o layout recarregado depois do Entendi (novidade nula) não fecha o comunicado aberto', async () => {
  // O LIDO do comunicado faz revalidatePath do layout: a novidade volta nula, porque o cookie já está gravado.
  const t = await montarAvisos(NOVIDADE)
  await t.clique('Entendi')
  await t.clique('LIDO')
  assert.match(textoDaTela(), /Inventário/)
  await t.redesenhar({ novidade: null, usuarioId: 'pessoa-a', comunicados: COMUNICADOS })
  assert.equal(janelasAbertas(), 1)
  assert.match(textoDaTela(), /Inventário/)
  assert.match(textoDaTela(), /2 de 2/)
})
