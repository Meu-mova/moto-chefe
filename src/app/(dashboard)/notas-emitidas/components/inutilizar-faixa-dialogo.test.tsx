// Diálogo "Inutilizar faixa" (#655, opção A do protótipo): o que cada passo envia e o que trava o envio.
// As actions são a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { ResultadoAction } from '@/lib/resultado-action'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar: desmontarDom } = montarDom()
after(desmontarDom)

const router = { refresh: mock.fn() }
mock.module('next/navigation', { namedExports: { useRouter: () => router } })

type Contexto = { ambiente: string; serie: string; uf: string; permiteInutilizar: boolean }
const CONTEXTO: Contexto = { ambiente: 'Homologacao', serie: '3', uf: 'MG', permiteInutilizar: true }
const SEM_CONFLITO = { numerosDeNotas: [] as number[], pedidos: [] as { numeroInicial: number; numeroFinal: number; situacao: string }[] }
const api = {
  contexto: mock.fn(async (): Promise<ResultadoAction<Contexto>> => ({ ok: true, dados: CONTEXTO })),
  conferir: mock.fn(async (_e: unknown): Promise<ResultadoAction<{ serie: string; conflitos: typeof SEM_CONFLITO }>> => ({ ok: true, dados: { serie: '3', conflitos: SEM_CONFLITO } })),
  pedir: mock.fn(async (_e: unknown): Promise<ResultadoAction<{ inutilizacaoId: string; aviso: string | null }>> => ({ ok: true, dados: { inutilizacaoId: 'f-1', aviso: null } })),
}
mock.module('../actions', { namedExports: {
  contextoDaFaixaAction: (...a: []) => api.contexto(...a),
  conferirFaixaAction: (e: unknown) => api.conferir(e),
  pedirFaixaAction: (e: unknown) => api.pedir(e),
} })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const m of Object.values(api)) m.mock.resetCalls()
  api.contexto.mock.mockImplementation(async () => ({ ok: true, dados: CONTEXTO }))
  api.conferir.mock.mockImplementation(async () => ({ ok: true, dados: { serie: '3', conflitos: SEM_CONFLITO } }))
  api.pedir.mock.mockImplementation(async () => ({ ok: true, dados: { inutilizacaoId: 'f-1', aviso: null } }))
  router.refresh.mock.resetCalls()
  for (const desmontar of montados.splice(0)) await desmontar()
})

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
const DEPOIS_DA_ANIMACAO_MS = 300
const textoDaTela = () => document.body.textContent ?? ''
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)
const clicar = (el: Element | undefined) => el!.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
const dialogoAberto = () => document.querySelector('[data-slot="dialog-content"]') !== null

async function montar(ambiente: 'Producao' | 'Homologacao' = 'Homologacao') {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { InutilizarFaixaDialogo } = await import('./inutilizar-faixa-dialogo')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(InutilizarFaixaDialogo, { ambiente })) })
  const preencher = (id: string, valor: string) => act(async () => {
    const campo = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement
    const proto = campo instanceof dom.window.HTMLTextAreaElement ? dom.window.HTMLTextAreaElement.prototype : dom.window.HTMLInputElement.prototype
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(campo, valor)
    campo.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  const clique = (texto: string, ms = 50) => act(async () => { clicar(botao(texto)); await esperar(ms) })
  const abrir = () => clique('Inutilizar faixa')
  const faixaValida = async () => { await preencher('inicio-faixa', '16'); await preencher('fim-faixa', '24'); await preencher('justificativa-faixa', 'Quebra na sequência da numeração') }
  const marcarConferi = () => act(async () => { clicar(document.querySelector('input[type="checkbox"]') as Element) })
  let montado = true
  const desmontar = () => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() })
  montados.push(desmontar)
  return { act, abrir, preencher, clique, faixaValida, marcarConferi, desmontar }
}

test('abrir e cancelar não envia nada; o diálogo mostra a série da NG sem seletor', async () => {
  const t = await montar()
  await t.abrir()
  assert.equal(api.contexto.mock.callCount(), 1)
  assert.equal((document.getElementById('serie-faixa') as HTMLInputElement).value, '3')
  assert.equal((document.getElementById('serie-faixa') as HTMLInputElement).readOnly, true)
  assert.equal(document.querySelectorAll('select').length, 0)
  await t.clique('Cancelar', DEPOIS_DA_ANIMACAO_MS)
  assert.equal(api.conferir.mock.callCount() + api.pedir.mock.callCount(), 0)
  assert.ok(!dialogoAberto())
})

test('Continuar só habilita com faixa válida, e a regra do erro é a do servidor', async () => {
  const t = await montar()
  await t.abrir()
  assert.ok(botao('Continuar')!.disabled)
  await t.preencher('inicio-faixa', '30'); await t.preencher('fim-faixa', '20'); await t.preencher('justificativa-faixa', 'Quebra na sequência da numeração')
  assert.ok(botao('Continuar')!.disabled, 'decrescente')
  assert.match(textoDaTela(), /faixa crescente/)
  await t.preencher('fim-faixa', '40000')
  assert.match(textoDaTela(), /no máximo 10\.000/)
  await t.preencher('inicio-faixa', '16'); await t.preencher('fim-faixa', '24')
  assert.ok(!botao('Continuar')!.disabled)
})

test('fluxo: Continuar confere, mostra os avisos sem bloquear, e o envio exige a caixa e leva a chave da abertura', async () => {
  api.conferir.mock.mockImplementation(async () => ({ ok: true, dados: { serie: '3', conflitos: { numerosDeNotas: [17, 18], pedidos: [{ numeroInicial: 20, numeroFinal: 30, situacao: 'pendente' }] } } }))
  const t = await montar()
  await t.abrir(); await t.faixaValida()
  await t.clique('Continuar')
  assert.deepEqual(api.conferir.mock.calls[0].arguments[0], { ambiente: 'Homologacao', numeroInicial: '16', numeroFinal: '24', justificativa: 'Quebra na sequência da numeração' })
  assert.match(textoDaTela(), /17, 18/)
  assert.match(textoDaTela(), /20 a 30/)
  assert.match(textoDaTela(), /fora do MOVA não são verificadas/)
  assert.ok(botao('Confirmar inutilização')!.disabled, 'sem a caixa não envia')
  assert.equal(api.pedir.mock.callCount(), 0)
  await t.marcarConferi()
  await t.clique('Confirmar inutilização')
  assert.equal(api.pedir.mock.callCount(), 1)
  const enviado = api.pedir.mock.calls[0].arguments[0] as { chave: string }
  assert.deepEqual({ ...enviado, chave: 'x' }, { chave: 'x', ambiente: 'Homologacao', numeroInicial: '16', numeroFinal: '24', justificativa: 'Quebra na sequência da numeração' })
  assert.ok(enviado.chave.length >= 16)
  assert.match(textoDaTela(), /Pedido enviado/)
  await t.clique('Fechar', DEPOIS_DA_ANIMACAO_MS)
  assert.equal(router.refresh.mock.callCount(), 1)

  // Reabrir é outra tentativa: outra chave, para o histórico não confundir dois pedidos.
  await t.abrir(); await t.faixaValida(); await t.clique('Continuar'); await t.marcarConferi(); await t.clique('Confirmar inutilização')
  assert.notEqual((api.pedir.mock.calls[1].arguments[0] as { chave: string }).chave, enviado.chave)
})

test('trava enquanto envia: duplo clique envia uma vez, botões desabilitados e Escape não fecha', async () => {
  let liberar: () => void = () => {}
  api.pedir.mock.mockImplementation(() => new Promise(ok => { liberar = () => ok({ ok: true, dados: { inutilizacaoId: 'f-1', aviso: null } }) }))
  const t = await montar()
  await t.abrir(); await t.faixaValida(); await t.clique('Continuar'); await t.marcarConferi()
  await t.act(async () => { clicar(botao('Confirmar inutilização')); clicar(botao('Confirmar inutilização')); await esperar(20) })
  assert.equal(api.pedir.mock.callCount(), 1)
  assert.ok(botao('Confirmar inutilização')!.disabled && botao('Voltar')!.disabled)
  await t.act(async () => { document.querySelector('[data-slot="dialog-content"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.ok(dialogoAberto(), 'Escape não fecha enquanto envia')
  await t.act(async () => { liberar(); await esperar(20) })
  assert.match(textoDaTela(), /Pedido enviado/)
})

test('recusa do servidor e resposta sem confirmação aparecem na tela e nada some', async () => {
  api.pedir.mock.mockImplementationOnce(async () => ({ ok: false, erro: 'A Nota Gateway recusou o pedido: faixa invalida' }))
  const t = await montar()
  await t.abrir(); await t.faixaValida(); await t.clique('Continuar'); await t.marcarConferi(); await t.clique('Confirmar inutilização')
  assert.match(textoDaTela(), /recusou o pedido: faixa invalida/)
  assert.ok(!botao('Confirmar inutilização')!.disabled, 'a pessoa pode tentar de novo')
  api.pedir.mock.mockImplementationOnce(async () => ({ ok: true, dados: { inutilizacaoId: 'f-2', aviso: 'A Nota Gateway não respondeu.' } }))
  await t.clique('Confirmar inutilização')
  assert.match(textoDaTela(), /não respondeu/)
})

test('depois da recusa a nova tentativa vai com outra chave; sem resposta, repete a mesma', async () => {
  const chaveDa = (n: number) => (api.pedir.mock.calls[n].arguments[0] as { chave: string }).chave
  api.pedir.mock.mockImplementationOnce(async () => ({ ok: false, erro: 'A Nota Gateway recusou o pedido: faixa invalida' }))
  const t = await montar()
  await t.abrir(); await t.faixaValida(); await t.clique('Continuar'); await t.marcarConferi(); await t.clique('Confirmar inutilização')
  await t.clique('Confirmar inutilização')
  assert.equal(api.pedir.mock.callCount(), 2)
  assert.notEqual(chaveDa(1), chaveDa(0), 'a linha recusada ficou gravada: a mesma chave só devolveria "já registrada"')
  api.pedir.mock.mockImplementationOnce(async () => { throw new Error('rede') })
  await t.clique('Fechar', DEPOIS_DA_ANIMACAO_MS)
  await t.abrir(); await t.faixaValida(); await t.clique('Continuar'); await t.marcarConferi(); await t.clique('Confirmar inutilização')
  assert.match(textoDaTela(), /Confira o histórico/)
})

test('UF excluída: explica e não deixa continuar; produção avisa que não tem volta', async () => {
  api.contexto.mock.mockImplementationOnce(async () => ({ ok: true, dados: { ...CONTEXTO, uf: 'SP', permiteInutilizar: false } }))
  const t = await montar('Producao')
  await t.abrir(); await t.faixaValida()
  assert.match(textoDaTela(), /Acre, Bahia e São Paulo/)
  assert.ok(botao('Continuar')!.disabled)
  assert.equal(api.conferir.mock.callCount(), 0)
  await t.clique('Cancelar', DEPOIS_DA_ANIMACAO_MS)
  api.contexto.mock.mockImplementationOnce(async () => ({ ok: true, dados: { ...CONTEXTO, ambiente: 'Producao' } }))
  await t.abrir()
  assert.match(textoDaTela(), /não poderá ser usada/)
})

test('erro ao ler a configuração aparece e não mostra formulário', async () => {
  api.contexto.mock.mockImplementationOnce(async () => ({ ok: false, erro: 'Nota Gateway não configurada para esta empresa.' }))
  const t = await montar()
  await t.abrir()
  assert.match(textoDaTela(), /não configurada/)
  assert.equal(document.getElementById('inicio-faixa'), null)
})
