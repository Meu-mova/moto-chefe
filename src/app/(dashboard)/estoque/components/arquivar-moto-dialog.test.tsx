// Diálogo "Arquivar moto" (#688, variante B do protótipo): o que cada passo mostra, o que envia e a
// trava enquanto envia. As actions são a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { ResultadoAction } from '@/lib/resultado-action'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar: desmontarDom } = montarDom()
after(desmontarDom)

type Moto = { id: string; chassi: string; modelo: string; loja: string; nfEntrada: string | null; bloqueio: string | null }
const moto = (n: number, bloqueio: string | null = null): Moto =>
  ({ id: `m-${n}`, chassi: `TESTE00ARQ00000${n}`, modelo: 'X12', loja: 'Loja Teste', nfEntrada: '43440', bloqueio })
const TRAVADA = 'Tem reserva em aberto. Cancele ou finalize a reserva antes de arquivar.'
const DA_NF = [moto(1), moto(2), moto(3, TRAVADA)]

const api = {
  buscar: mock.fn(async (_termo: string): Promise<Moto[]> => DA_NF),
  arquivar: mock.fn(async (_ids: string[], _motivo: string): Promise<ResultadoAction<{ arquivadas: number }>> => ({ ok: true, dados: { arquivadas: 2 } })),
}
mock.module('../arquivar-actions', { namedExports: {
  buscarMotosParaArquivarAction: (t: string) => api.buscar(t),
  arquivarMotosAction: (ids: string[], motivo: string) => api.arquivar(ids, motivo),
} })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const m of Object.values(api)) m.mock.resetCalls()
  api.buscar.mock.mockImplementation(async () => DA_NF)
  api.arquivar.mock.mockImplementation(async () => ({ ok: true, dados: { arquivadas: 2 } }))
  for (const desmontar of montados.splice(0)) await desmontar()
})

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const DEPOIS_DA_ANIMACAO_MS = 300
const textoDaTela = () => document.body.textContent ?? ''
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)
const clicar = (el: Element | null | undefined) => { assert.ok(el, 'elemento não encontrado'); el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })) }
const caixa = (rotulo: string) => document.querySelector(`input[type="checkbox"][aria-label="${rotulo}"]`) as HTMLInputElement | null
const dialogoAberto = () => document.querySelector('[data-slot="dialog-content"]') !== null

async function montar() {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ArquivarMotoDialog } = await import('./arquivar-moto-dialog')
  const onFechar = mock.fn()
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(ArquivarMotoDialog, { aberto: true, onFechar })) })
  const preencher = (id: string, valor: string) => act(async () => {
    const campo = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement
    const proto = campo instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(campo, valor)
    campo.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  const clique = (texto: string, ms = 50) => act(async () => { clicar(botao(texto)); await esperar(ms) })
  const marcar = (rotulo: string) => act(async () => { clicar(caixa(rotulo)) })
  const buscar = async (termo: string) => { await preencher('busca-arquivar', termo); await clique('Buscar') }
  /** Passo 1 com as 2 motos livres da NF marcadas, até o passo 3 com o motivo. */
  const ateConfirmar = async (motivo = 'Moto do golpe do link de pagamento') => {
    await buscar('43440'); await marcar('Marcar todas que podem (2)')
    await clique('Continuar com 2 motos'); await clique('Continuar')
    await preencher('motivo-arquivo', motivo)
  }
  let montado = true
  const desmontar = () => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() })
  montados.push(desmontar)
  return { act, preencher, clique, marcar, buscar, ateConfirmar, onFechar }
}

test('moto travada aparece apagada com o motivo e fica fora do "marcar todas que podem"', async () => {
  const t = await montar()
  assert.ok(botao('Continuar com 0 motos')?.disabled, 'sem moto escolhida não continua')
  await t.buscar('43440')
  assert.deepEqual(api.buscar.mock.calls.map(c => c.arguments[0]), ['43440'])
  assert.match(textoDaTela(), new RegExp(TRAVADA))
  assert.ok(caixa('TESTE00ARQ000003')!.disabled)
  await t.marcar('Marcar todas que podem (2)')
  assert.deepEqual([1, 2, 3].map(n => caixa(`TESTE00ARQ00000${n}`)!.checked), [true, true, false])
  assert.ok(!botao('Continuar com 2 motos')!.disabled)
})

test('as escolhidas ficam marcadas de uma busca para outra e vão juntas para a confirmação', async () => {
  const t = await montar()
  await t.buscar('43440'); await t.marcar('TESTE00ARQ000001')
  api.buscar.mock.mockImplementation(async () => [moto(7)])
  await t.buscar('ARQ000007'); await t.marcar('TESTE00ARQ000007')
  await t.clique('Continuar com 2 motos')
  assert.match(textoDaTela(), /Ao arquivar/)
  await t.clique('Continuar')
  assert.match(textoDaTela(), /TESTE00ARQ000001/)
  assert.match(textoDaTela(), /TESTE00ARQ000007/)
  assert.doesNotMatch(textoDaTela(), /TESTE00ARQ000002/, 'vista na busca mas não marcada: fora da confirmação')
})

test('moto escolhida que volta travada numa busca nova sai da escolha', async () => {
  const t = await montar()
  await t.buscar('43440'); await t.marcar('Marcar todas que podem (2)')
  api.buscar.mock.mockImplementation(async () => [moto(1, TRAVADA)])
  await t.buscar('ARQ000001')
  assert.equal(caixa('TESTE00ARQ000001')!.checked, false, 'travada não fica marcada sem como desmarcar')
  assert.ok(botao('Continuar com 1 moto'), 'só a outra continua escolhida')
  await t.clique('Continuar com 1 moto'); await t.clique('Continuar')
  assert.match(textoDaTela(), /TESTE00ARQ000002/)
  assert.doesNotMatch(textoDaTela(), /TESTE00ARQ000001/, 'a travada não vai para a confirmação')
})

test('sem motivo não envia; com motivo envia os ids escolhidos e termina em "N motos arquivadas"', async () => {
  const t = await montar()
  await t.ateConfirmar('   ')
  assert.ok(botao('Arquivar 2 motos')!.disabled, 'motivo em branco, como o servidor recusa')
  await t.preencher('motivo-arquivo', 'Moto do golpe do link de pagamento')
  await t.clique('Arquivar 2 motos')
  assert.deepEqual(api.arquivar.mock.calls.map(c => c.arguments), [[['m-1', 'm-2'], 'Moto do golpe do link de pagamento']])
  assert.match(textoDaTela(), /2 motos arquivadas/)
  await t.clique('Fechar')
  assert.equal(t.onFechar.mock.callCount(), 1)
})

test('recusa do servidor aparece no diálogo, que continua aberto no passo 3', async () => {
  api.arquivar.mock.mockImplementationOnce(async () => ({ ok: false, erro: `TESTE00ARQ000001: ${TRAVADA}` }))
  const t = await montar()
  await t.ateConfirmar()
  await t.clique('Arquivar 2 motos')
  assert.match(textoDaTela(), new RegExp(`TESTE00ARQ000001: ${TRAVADA}`))
  assert.ok(!botao('Arquivar 2 motos')!.disabled, 'a pessoa pode tentar de novo')
  assert.equal(t.onFechar.mock.callCount(), 0)
  await t.clique('Voltar'); await t.clique('Voltar e mudar as motos')
  assert.doesNotMatch(textoDaTela(), /TESTE00ARQ000001: /, 'a recusa do envio não fica na tela de escolher')
})

test('trava enquanto envia: duplo clique envia uma vez, botões desabilitados e Escape não fecha', async () => {
  let liberar: () => void = () => {}
  api.arquivar.mock.mockImplementation(() => new Promise(ok => { liberar = () => ok({ ok: true, dados: { arquivadas: 2 } }) }))
  const t = await montar()
  await t.ateConfirmar()
  await t.act(async () => { clicar(botao('Arquivar 2 motos')); clicar(botao('Arquivar 2 motos')); await esperar(20) })
  assert.equal(api.arquivar.mock.callCount(), 1)
  assert.ok(botao('Arquivando...')!.disabled, 'o botão de enviar trava')
  assert.ok(botao('Voltar')!.disabled && botao('Cancelar')!.disabled)
  assert.ok((document.querySelector('[aria-label="Fechar"]') as HTMLButtonElement).disabled)
  await t.act(async () => { document.querySelector('[data-slot="dialog-content"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.equal(t.onFechar.mock.callCount(), 0, 'Escape não fecha enquanto envia')
  assert.ok(dialogoAberto())
  await t.act(async () => { liberar(); await esperar(20) })
  assert.match(textoDaTela(), /2 motos arquivadas/)
})

test('busca que falha avisa na tela e deixa buscar de novo', async () => {
  api.buscar.mock.mockImplementationOnce(async () => { throw new Error('rede') })
  const t = await montar()
  await t.buscar('43440')
  assert.match(textoDaTela(), /Não deu para buscar\. Tente de novo\./)
  await t.clique('Buscar')
  assert.ok(caixa('TESTE00ARQ000001'), 'a segunda busca traz as motos')
  assert.doesNotMatch(textoDaTela(), /Não deu para buscar/)
})

test('envio sem resposta avisa para conferir antes de tentar de novo e destrava', async () => {
  api.arquivar.mock.mockImplementationOnce(async () => { throw new Error('rede') })
  const t = await montar()
  await t.ateConfirmar()
  await t.clique('Arquivar 2 motos')
  assert.match(textoDaTela(), /Sem resposta do servidor\. Confira no Showroom se as motos saíram antes de tentar de novo\./)
  assert.ok(!botao('Arquivar 2 motos')!.disabled)
  assert.equal(t.onFechar.mock.callCount(), 0)
})

test('a recusa "Moto não encontrada" do servidor aparece como veio', async () => {
  api.arquivar.mock.mockImplementationOnce(async () => ({ ok: false, erro: 'Moto não encontrada' }))
  const t = await montar()
  await t.ateConfirmar()
  await t.clique('Arquivar 2 motos')
  assert.match(textoDaTela(), /Moto não encontrada/)
  assert.doesNotMatch(textoDaTela(), /motos arquivadas/)
})
