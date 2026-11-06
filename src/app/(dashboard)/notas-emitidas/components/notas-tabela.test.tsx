// As ações da nota ficam no menu da linha; o diálogo da inutilização fica no nível da tabela e
// mostra o resultado dentro dele: a linha pode mudar com o refresh e o diálogo continua na tela
// com a mensagem (C6, #597).
import { createElement, type ReactNode } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { NotaEmitidaComInutilizacao } from '@/lib/queries/notas-emitidas'
import type { ResultadoAction } from '@/lib/resultado-action'
import type { FiltroDownload } from './notas-tabela'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)
const g = globalThis as Record<string, unknown>

const NOTA: NotaEmitidaComInutilizacao = {
  id: 'nota-1', grupoId: 'grupo-1', numero: '974', serie: '1', status: 'Negada', categoria: 'recusada', motivoStatus: '225 - Falha no schema',
  ambiente: 'Homologacao', criadoEm: '2026-10-29T12:00:00Z', linkDanfe: null, linkXml: null,
  vendaId: null, vendaNumero: 31601, clienteNome: null, chassi: null, dataVenda: null,
  inutilizacao: { tipo: 'pode', serie: '1', numero: 974, ultimaNegada: null },
}
const PENDENTE: NotaEmitidaComInutilizacao = { ...NOTA, inutilizacao: { tipo: 'pendente', erro: 'Este número já tem um pedido de inutilização.' } }
const AUTORIZADA: NotaEmitidaComInutilizacao = {
  ...NOTA, id: 'nota-2', numero: '975', status: 'Autorizada', categoria: 'autorizada', motivoStatus: null,
  linkDanfe: 'https://ng.example/975.pdf', linkXml: 'https://ng.example/975.xml', inutilizacao: { tipo: 'nenhuma', erro: 'Só nota recusada tem o número livre.' },
}
// O filtro da tela diz Produção de propósito: o diálogo tem de mostrar o ambiente DA NOTA (C2).
const FILTRO: FiltroDownload = { situacao: 'recusada', ambiente: 'Producao', de: '2026-10-01', ate: '2026-10-31' }
const JUSTIFICATIVA = 'Venda cancelada apos a rejeicao'

const router = { refresh: mock.fn() }
mock.module('next/navigation', { namedExports: { useRouter: () => router } })
mock.module('next/link', { defaultExport: ({ href, children }: { href: string; children: ReactNode }) => createElement('a', { href }, children) })
// O que a action devolve; cada teste muda o que precisa e o afterEach restaura.
type Resposta = ResultadoAction<{ aviso: string | null }>
const enviado: Resposta = { ok: true, dados: { aviso: null } }
const api = { responder: async (): Promise<Resposta> => enviado }
// Teste que falha no meio não chega ao desmontar: o afterEach limpa o que sobrou, para não sujar o próximo.
const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  api.responder = async () => enviado
  router.refresh.mock.resetCalls()
  for (const desmontar of montados.splice(0)) await desmontar()
})
mock.module('../actions', { namedExports: { pedirInutilizacaoAction: () => api.responder() } })

const esperar = (ms: number) => new Promise(r => setTimeout(r, ms))
// Fechado, o Dialog do base-ui só sai do DOM depois da animação de saída.
const DEPOIS_DA_ANIMACAO_MS = 300
const textoDaTela = () => document.body.textContent ?? ''
const vezes = (texto: string) => textoDaTela().split(texto).length - 1
const botoes = (inicio: string) => [...document.querySelectorAll('button')].filter(b => (b.textContent ?? '').trim().startsWith(inicio))
const clicar = (el: Element) => el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => (b.textContent ?? '').trim() === texto)!
const itensDoMenu = () => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')]
const itemDoMenu = (texto: string) => itensDoMenu().find(i => (i.textContent ?? '').includes(texto))
const desabilitado = (el: Element | undefined) => el?.getAttribute('aria-disabled') === 'true'
// O campo só existe dentro do diálogo da inutilização: diz se ele está na tela.
const dialogoDeInutilizar = () => document.querySelector('#justificativa-inutilizacao') !== null
const ajudaDaJustificativa = () => document.getElementById('justificativa-ajuda')?.textContent ?? ''

type Chamada = { url: string; corpo: Record<string, unknown> }
// Captura o que vai à rota de download e segura a navegação do <a download>, que o jsdom não faz.
async function comDownloadFalso(corpo: (chamadas: Chamada[], baixados: string[]) => Promise<void>) {
  const chamadas: Chamada[] = []
  const baixados: string[] = []
  const fetchOriginal = g.fetch
  const clickOriginal = dom.window.HTMLAnchorElement.prototype.click
  g.fetch = async (url: string, init: RequestInit) => {
    chamadas.push({ url, corpo: JSON.parse(String(init.body)) })
    return { ok: true, headers: new Headers({ 'Content-Disposition': 'attachment; filename="975.pdf"' }), blob: async () => new Blob(['%PDF']) }
  }
  dom.window.HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) { baixados.push(this.download) }
  try {
    await corpo(chamadas, baixados)
  } finally {
    g.fetch = fetchOriginal
    dom.window.HTMLAnchorElement.prototype.click = clickOriginal
  }
}

async function montar() {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { NotasTabela } = await import('./notas-tabela')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  const desenhar = (notas: NotaEmitidaComInutilizacao[], podeInutilizar = true, filtro = FILTRO) => act(async () => {
    root.render(React.createElement(NotasTabela, { notas, podeInutilizar, totalComDocumento: 0, filtro }))
  })
  // O gatilho do menu do base-ui abre no mousedown; o item responde ao click.
  const abrirMenu = (numero: string) => act(async () => {
    document.querySelector(`button[aria-label="Ações da nota ${numero}"]`)!.dispatchEvent(new dom.window.MouseEvent('mousedown', { bubbles: true, button: 0 }))
    await esperar(50)
  })
  const escolher = (texto: string) => act(async () => { clicar(itemDoMenu(texto)!); await esperar(50) })
  const abrir = async () => { await abrirMenu('974'); await escolher('Inutilizar número') }
  const digitar = (texto: string) => act(async () => {
    const campo = document.querySelector<HTMLTextAreaElement>('#justificativa-inutilizacao')!
    Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value')!.set!.call(campo, texto)
    campo.dispatchEvent(new dom.window.Event('input', { bubbles: true }))
  })
  const confirmar = () => act(async () => { clicar(botoes('Inutilizar o número')[0]!); await esperar(50) })
  const fechar = (rotulo = 'Fechar') => act(async () => { clicar(botoes(rotulo)[0]!); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  const pedir = async () => { await abrir(); await digitar(JUSTIFICATIVA); await confirmar() }
  let montado = true
  const desmontar = () => act(async () => {
    if (!montado) return
    montado = false
    root.unmount()
    container.remove()
  })
  montados.push(desmontar)
  return { desenhar, abrirMenu, escolher, abrir, digitar, confirmar, fechar, pedir, desmontar, act }
}

test('o diálogo mostra a nota, o motivo da SEFAZ e o ambiente da nota, não o do filtro (C2)', async () => {
  const t = await montar()
  await t.desenhar([NOTA])
  await t.abrir()
  assert.ok(dialogoDeInutilizar(), 'o diálogo abre')
  assert.ok(textoDaTela().includes('Nota 974, série 1. Venda #31601 (não existe mais)'), 'a NOTA não tem venda (#690)')
  assert.ok(textoDaTela().includes('Teste (homologação)'), 'ambiente da nota, com o filtro da tela em Produção')
  assert.ok(textoDaTela().includes('Nota de teste: sem valor fiscal'))
  assert.ok(!textoDaTela().includes('nunca mais vai ser usado'))
  assert.ok(textoDaTela().includes('Motivo da SEFAZ (225)') && textoDaTela().includes('Falha no schema'))
  assert.equal(botoes('Inutilizar o número 974').length, 1)
  // O contador mede o texto como o servidor vai medir: sem acento, sem espaço repetido.
  await t.digitar('  Venda  cancelada após ')
  assert.ok(ajudaDaJustificativa().includes('20'), ajudaDaJustificativa())
  await t.desmontar()
})

test('a justificativa é conferida ao vivo com a regra do servidor (C3)', async () => {
  const t = await montar()
  await t.desenhar([NOTA])
  await t.abrir()
  assert.ok(botoes('Inutilizar o número')[0]!.disabled, 'vazia: não envia')
  await t.digitar('curta')
  assert.ok(textoDaTela().includes('pelo menos 15 caracteres'))
  assert.ok(botoes('Inutilizar o número')[0]!.disabled)
  await t.digitar('Venda cancelada — sem reenvio')
  assert.ok(textoDaTela().includes('só aceita letras, números e pontuação simples'))
  await t.digitar('Venda cancelada após a rejeição')
  assert.ok(!botoes('Inutilizar o número')[0]!.disabled, 'válida com acento: o acento sai no servidor')
  await t.desmontar()
})

test('recusa do servidor aparece no diálogo, que continua na tela quando a linha muda (C6)', async () => {
  api.responder = async () => ({ ok: false, erro: 'A Nota Gateway recusou o pedido: serie invalida' })
  const t = await montar()
  await t.desenhar([NOTA])
  await t.pedir()
  assert.ok(textoDaTela().includes('A Nota Gateway recusou o pedido: serie invalida'))
  await t.desenhar([PENDENTE])
  await t.act(async () => { await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.ok(textoDaTela().includes('A Nota Gateway recusou o pedido: serie invalida'), 'o diálogo não some com o redesenho')
  assert.ok(dialogoDeInutilizar())
  // Fechar depois da recusa também atualiza a lista: a linha pode ter virado negada.
  await t.fechar('Cancelar')
  assert.equal(router.refresh.mock.callCount(), 1)
  await t.desmontar()
})

test('erro inesperado da action vira mensagem no diálogo, sem fechar (C6)', async () => {
  api.responder = async () => { throw new Error('Minified React error #441') }
  const t = await montar()
  await t.desenhar([NOTA])
  await t.pedir()
  assert.ok(textoDaTela().includes('Não deu para pedir a inutilização'))
  assert.ok(dialogoDeInutilizar())
  await t.desmontar()
})

test('sucesso: o diálogo diz que o pedido foi enviado e a lista só atualiza no Fechar (C6)', async () => {
  const t = await montar()
  await t.desenhar([NOTA])
  await t.pedir()
  assert.ok(textoDaTela().includes('Pedido enviado'))
  assert.equal(router.refresh.mock.callCount(), 0, 'nada atualiza com o diálogo aberto')
  await t.fechar()
  assert.ok(!dialogoDeInutilizar(), 'fechou')
  assert.equal(router.refresh.mock.callCount(), 1)
  await t.desmontar()
})

test('sem resposta da Nota Gateway: o aviso aparece no diálogo (C6)', async () => {
  api.responder = async () => ({ ok: true, dados: { aviso: 'A Nota Gateway não respondeu. O pedido ficou pendente: confira o resultado mais tarde.' } })
  const t = await montar()
  await t.desenhar([NOTA])
  await t.pedir()
  assert.ok(textoDaTela().includes('A Nota Gateway não respondeu'))
  await t.desmontar()
})

test('menu da linha: baixar só com documento, e "Inutilizar número" só na elegível e para quem pode (C1, C5)', async () => {
  const t = await montar()
  await t.desenhar([NOTA])
  await t.abrirMenu('974')
  assert.deepEqual(itensDoMenu().map(i => i.textContent?.trim()), ['Ver motivo completo', 'Baixar PDF', 'Baixar XML', 'Inutilizar número'])
  assert.ok(desabilitado(itemDoMenu('Baixar PDF')) && desabilitado(itemDoMenu('Baixar XML')), 'recusada não tem documento')
  await t.escolher('Ver motivo completo')
  await t.desenhar([NOTA], false)
  await t.fechar()
  await t.abrirMenu('974')
  assert.equal(itemDoMenu('Inutilizar número'), undefined, 'sem permissão: sem o item')
  assert.ok(itemDoMenu('Ver motivo completo'), 'o resto do menu continua')
  await t.escolher('Ver motivo completo')
  await t.fechar()
  await t.desenhar([PENDENTE])
  await t.abrirMenu('974')
  assert.equal(itemDoMenu('Inutilizar número'), undefined, 'pendente: sem o item')
  await t.escolher('Ver motivo completo')
  await t.fechar()
  await t.desmontar()
})

test('a situação da inutilização vira um selo na linha; a frase inteira fica em "Ver motivo completo" (C5, C8)', async () => {
  const t = await montar()
  const numeroUsado = 'O número 974 está em outra nota deste grupo (autorizada, cancelada, denegada ou em andamento). Não há o que inutilizar.'
  const casos: [NotaEmitidaComInutilizacao['inutilizacao'], string, string][] = [
    [PENDENTE.inutilizacao, 'Inutilização pendente', 'Este número já tem um pedido de inutilização.'],
    [{ tipo: 'autorizada', erro: 'Este número já foi inutilizado.' }, 'Número inutilizado', 'Este número já foi inutilizado.'],
    [{ tipo: 'numero_usado', erro: numeroUsado }, 'Número já usado', numeroUsado],
    [{ tipo: 'pode', serie: '1', numero: 974, ultimaNegada: 'Faixa ja utilizada' }, 'Inutilização negada', 'Negada: Faixa ja utilizada. Pode pedir de novo.'],
  ]
  for (const [inutilizacao, selo, frase] of casos) {
    await t.desenhar([{ ...NOTA, inutilizacao }], false)
    assert.equal(vezes(selo), 2, `${selo}: na linha da tabela e no cartão do celular`)
    assert.ok(!textoDaTela().includes(frase), `${selo}: a frase não cabe na linha`)
    await t.abrirMenu('974')
    await t.escolher('Ver motivo completo')
    assert.ok(textoDaTela().includes(frase), `${selo}: a frase aparece no diálogo`)
    await t.fechar()
  }
  await t.desenhar([NOTA])
  assert.equal(vezes('Inutilização'), 0, 'elegível sem histórico: nenhum segundo selo')
  await t.desmontar()
})

test('"Ver motivo completo" mostra o motivo da SEFAZ com o código separado, e Fechar fecha', async () => {
  const t = await montar()
  await t.desenhar([{ ...NOTA, motivoStatus: '539 - Rejeicao: Duplicidade de NF-e, com diferenca na Chave de Acesso [chNFe: 3126]' }])
  await t.abrirMenu('974')
  await t.escolher('Ver motivo completo')
  assert.ok(textoDaTela().includes('Motivo da nota 974'))
  assert.ok(textoDaTela().includes('Motivo da SEFAZ (539)'))
  assert.ok(textoDaTela().includes('Duplicidade de NF-e, com diferenca na Chave de Acesso [chNFe: 3126]'))
  assert.ok(textoDaTela().includes('Série 1. Venda #31601 (não existe mais). Recusada em 29/10/2026'), 'a NOTA não tem venda (#690)')
  await t.fechar()
  assert.ok(!textoDaTela().includes('Motivo da nota 974'))
  await t.desenhar([{ ...NOTA, status: 'Processando', categoria: 'em_andamento' }], true, { ...FILTRO, situacao: 'em_andamento' })
  await t.abrirMenu('974')
  await t.escolher('Ver motivo completo')
  assert.ok(textoDaTela().includes('Em andamento desde 29/10/2026'))
  await t.fechar()
  await t.desmontar()
})

test('grupo em outro ambiente ou sem credencial: selo na linha e a orientação em "Ver motivo completo", sem o item de inutilizar', async () => {
  const t = await montar()
  const orientacao = 'Esta nota é de homologação e o grupo está em produção. Volte o ambiente em Admin, Notas fiscais, para inutilizar o número'
  const semCredencial = 'Nota Gateway não configurada para esta empresa.'
  const casos: [NotaEmitidaComInutilizacao['inutilizacao'], string, string][] = [
    [{ tipo: 'ambiente_divergente', erro: orientacao }, 'Grupo em outro ambiente', orientacao],
    [{ tipo: 'sem_configuracao', erro: semCredencial }, 'Nota Gateway não configurada', semCredencial],
  ]
  for (const [inutilizacao, selo, frase] of casos) {
    await t.desenhar([{ ...NOTA, inutilizacao }])
    assert.equal(vezes(selo), 2, selo)
    await t.abrirMenu('974')
    assert.equal(itemDoMenu('Inutilizar número'), undefined, selo)
    await t.escolher('Ver motivo completo')
    assert.ok(textoDaTela().includes(frase), selo)
    await t.fechar()
  }
  await t.desmontar()
})

test('baixar pelo menu: PDF e XML da nota com documento vão à rota com o id da nota e o filtro (regressão)', async () => {
  await comDownloadFalso(async (chamadas, baixados) => {
    const t = await montar()
    await t.desenhar([AUTORIZADA], true, { ...FILTRO, situacao: 'todas' })
    await t.abrirMenu('975')
    assert.ok(!desabilitado(itemDoMenu('Baixar PDF')) && !desabilitado(itemDoMenu('Baixar XML')))
    assert.equal(itemDoMenu('Ver motivo completo'), undefined, 'autorizada sem motivo: sem o item')
    assert.equal(itemDoMenu('Inutilizar número'), undefined, 'autorizada: número ocupado')
    await t.escolher('Baixar PDF')
    await t.abrirMenu('975')
    await t.escolher('Baixar XML')
    assert.deepEqual(chamadas.map(c => c.corpo.tipo), ['pdf', 'xml'])
    assert.deepEqual(chamadas[0]!.corpo, { situacao: 'todas', ambiente: 'Producao', de: '2026-10-01', ate: '2026-10-31', tipo: 'pdf', id: ['nota-2'] })
    assert.equal(chamadas[0]!.url, '/api/notas-emitidas/arquivos')
    assert.deepEqual(baixados, ['975.pdf', '975.pdf'], 'o nome vem do Content-Disposition')
    await t.desmontar()
  })
})

test('a coluna Motivo só aparece nas abas Recusadas e Canceladas', async () => {
  const t = await montar()
  await t.desenhar([NOTA])
  assert.ok([...document.querySelectorAll('th')].some(th => th.textContent === 'Motivo'))
  assert.ok(textoDaTela().includes('225 - Falha no schema'))
  await t.desenhar([NOTA], true, { ...FILTRO, situacao: 'todas' })
  assert.ok(![...document.querySelectorAll('th')].some(th => th.textContent === 'Motivo'))
  assert.ok(!textoDaTela().includes('225 - Falha no schema'), 'na aba Todas o motivo fica só em "Ver motivo completo"')
  await t.desmontar()
})

test('trava enquanto envia: botões desabilitados, sem o X e Escape não fecha; livre, Escape fecha (C2)', async () => {
  let resolver!: (r: Resposta) => void
  api.responder = () => new Promise<Resposta>(r => { resolver = r })
  const t = await montar()
  await t.desenhar([NOTA])
  await t.pedir()
  assert.ok(botoes('Inutilizar o número')[0]!.disabled, 'confirmar desabilitado')
  assert.ok(botoes('Cancelar')[0]!.disabled, 'cancelar desabilitado')
  assert.equal(botoes('Close').length, 0, 'sem o X')
  const escape = () => t.act(async () => {
    document.querySelector('[data-slot="dialog-content"]')!.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await esperar(DEPOIS_DA_ANIMACAO_MS)
  })
  await escape()
  assert.ok(dialogoDeInutilizar(), 'Escape não fecha enquanto envia')
  await t.act(async () => { resolver(enviado); await esperar(50) })
  assert.ok(textoDaTela().includes('Pedido enviado'))
  // Controle: livre, o mesmo Escape fecha (e atualiza a lista, como o Fechar).
  await escape()
  assert.ok(!dialogoDeInutilizar(), 'Escape fecha depois do envio')
  assert.equal(router.refresh.mock.callCount(), 1)
  await t.desmontar()
})

test('ambiente: só Homologacao é teste; produção e qualquer outro valor mostram o aviso sem volta (C2)', async () => {
  const t = await montar()
  for (const ambiente of ['Producao', '']) {
    await t.desenhar([{ ...NOTA, ambiente }])
    await t.abrir()
    assert.ok(textoDaTela().includes('O número 974 nunca mais vai ser usado'), ambiente || '(vazio)')
    assert.ok(!textoDaTela().includes('Teste (homologação)'), ambiente || '(vazio)')
    await t.fechar('Cancelar')
  }
  await t.desmontar()
})

test('justificativa longa: a mensagem de máximo aparece e o navegador não corta calado (C3)', async () => {
  const t = await montar()
  await t.desenhar([NOTA])
  await t.abrir()
  assert.equal(document.querySelector('#justificativa-inutilizacao')!.getAttribute('maxlength'), null, 'sem maxLength')
  await t.digitar('a'.repeat(256))
  assert.ok(textoDaTela().includes('no máximo 255 caracteres'))
  assert.ok(botoes('Inutilizar o número')[0]!.disabled)
  await t.desmontar()
})

test('a lista esvazia com o diálogo aberto: ele continua na tela (C6)', async () => {
  const t = await montar()
  await t.desenhar([NOTA])
  await t.abrir()
  await t.desenhar([])
  await t.act(async () => { await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.ok(textoDaTela().includes('Nenhuma nota neste filtro.'))
  assert.ok(dialogoDeInutilizar())
  await t.desmontar()
})

const lista = () => document.querySelector('ul[aria-label="Notas emitidas"]')!

// NOTA não tem venda (cancelada ou removida); esta tem, com o link para Vendas.
const COM_VENDA: NotaEmitidaComInutilizacao = { ...AUTORIZADA, vendaId: 'venda-2', vendaNumero: 31602, clienteNome: 'Maria Oliveira', chassi: 'LXY690', dataVenda: '2026-10-29T12:00:00Z' }
const SEM_VENDA = 'Venda #31601 (não existe mais)'

test('venda que não existe mais (#690): a linha e o cartão dizem isso no lugar da venda; com venda, o número com link', async () => {
  const t = await montar()
  const todas = { ...FILTRO, situacao: 'todas' as const }
  await t.desenhar([NOTA, COM_VENDA], true, todas)
  const [semVenda, comVenda] = [...document.querySelectorAll('tbody > tr')]
  assert.ok(semVenda!.textContent!.includes(SEM_VENDA), semVenda!.textContent!)
  assert.equal(comVenda!.querySelector('a[href^="/vendas?"]')?.textContent, '#31602')
  assert.ok(!comVenda!.textContent!.includes('não existe mais'))

  const [cartaoSemVenda, cartaoComVenda] = [...lista().querySelectorAll(':scope > li')]
  assert.ok(cartaoSemVenda!.textContent!.includes(SEM_VENDA), cartaoSemVenda!.textContent!)
  assert.equal(cartaoComVenda!.querySelector('a[href^="/vendas?"]')?.textContent, '#31602')
  assert.ok(!cartaoComVenda!.textContent!.includes('não existe mais'))
  await t.desmontar()
})

test('cartão sem venda (#690, variante C): a venda aparece só no título; o rodapé fica com NF, série e data', async () => {
  const t = await montar()
  await t.desenhar([NOTA, COM_VENDA], true, { ...FILTRO, situacao: 'todas' })
  const [semVenda, comVenda] = [...lista().querySelectorAll(':scope > li')].map(li => li.textContent ?? '')
  assert.equal(semVenda!.split('Venda').length - 1, 1, semVenda)
  assert.ok(semVenda!.includes(SEM_VENDA) && semVenda!.includes('NF 974') && semVenda!.includes('Série 1') && semVenda!.includes('29/10'), semVenda)
  assert.ok(comVenda!.includes('Maria Oliveira') && comVenda!.includes('Venda #31602'), comVenda)
  await t.desmontar()
})

test('celular: cartão com o cliente em destaque, os selos, o motivo da SEFAZ em bloco só na recusada e os fatos da nota (C8)', async () => {
  const t = await montar()
  await t.desenhar([NOTA, { ...AUTORIZADA, clienteNome: 'Maria Oliveira' }], true, { ...FILTRO, situacao: 'todas' })
  const cartoes = [...lista().querySelectorAll(':scope > li')].map(li => li.textContent ?? '')
  assert.equal(cartoes.length, 2)
  const [recusada, autorizada] = cartoes as [string, string]
  assert.ok(recusada.includes(SEM_VENDA) && recusada.includes('Recusada'), 'sem venda, o lugar do cliente diz isso (#690)')
  assert.ok(recusada.includes('Motivo da SEFAZ (225)') && recusada.includes('Falha no schema'), 'recusada: bloco do motivo')
  assert.ok(recusada.includes('NF 974') && recusada.includes('Série 1') && recusada.includes('Venda #31601') && recusada.includes('29/10'))
  assert.ok(autorizada.includes('Maria Oliveira') && autorizada.includes('Autorizada') && autorizada.includes('NF 975'))
  assert.ok(!autorizada.includes('Motivo da SEFAZ'), 'autorizada: sem bloco de motivo')
  assert.equal(lista().querySelectorAll('input[type="checkbox"]').length, 0, 'fora do modo Selecionar: sem caixas')
  assert.ok(textoDaTela().includes('2 notas'))
  await t.desmontar()
})

test('celular: "Selecionar" mostra as caixas, só a nota com documento marca, Baixar leva as marcadas e Cancelar limpa (#402)', async () => {
  await comDownloadFalso(async chamadas => {
    const t = await montar()
    await t.desenhar([NOTA, AUTORIZADA], true, { ...FILTRO, situacao: 'todas' })
    await t.act(async () => { clicar(botao('Selecionar')) })
    const caixa = (numero: string) => lista().querySelector<HTMLInputElement>(`input[aria-label="Selecionar a nota ${numero}"]`)!
    assert.ok(caixa('974').disabled, 'recusada: sem documento, caixa desabilitada')
    assert.ok(!caixa('975').disabled)
    assert.ok(botao('Baixar').disabled, 'nada marcado: Baixar espera')
    await t.act(async () => { caixa('975').click() })
    await t.act(async () => { clicar(botao('Baixar 1')); await esperar(50) })
    assert.deepEqual(chamadas.map(c => c.corpo), [{ situacao: 'todas', ambiente: 'Producao', de: '2026-10-01', ate: '2026-10-31', tipo: 'ambos', id: ['nota-2'] }])
    await t.act(async () => { clicar(botao('Cancelar')) })
    assert.equal(lista().querySelectorAll('input[type="checkbox"]').length, 0, 'saiu do modo')
    assert.ok(textoDaTela().includes('2 notas'))
    assert.ok(!document.querySelector<HTMLInputElement>('table input[aria-label="Selecionar a nota 975"]')!.checked, 'a seleção foi limpa para a tabela também')
    await t.desmontar()
  })
})

const AUTORIZADA_2: NotaEmitidaComInutilizacao = { ...AUTORIZADA, id: 'nota-3', numero: '976' }
const CANCELADA: NotaEmitidaComInutilizacao = { ...AUTORIZADA, id: 'nota-4', numero: '977', status: 'Cancelada', categoria: 'cancelada' }
const EM_ANDAMENTO: NotaEmitidaComInutilizacao = { ...NOTA, id: 'nota-5', numero: '978', status: 'Processando', categoria: 'em_andamento', motivoStatus: null }
const MISTA = [NOTA, AUTORIZADA, EM_ANDAMENTO, AUTORIZADA_2, CANCELADA]

const caixaDe = (numero: string) => lista().querySelector<HTMLInputElement>(`input[aria-label="Selecionar a nota ${numero}"]`)!
const caixaTodas = () => [...document.querySelectorAll('label')].find(l => (l.textContent ?? '').includes('Selecionar todas'))!.querySelector('input')!
const filtroTodas = { ...FILTRO, situacao: 'todas' as const }

test('celular: "Selecionar todas" marca só as notas com documento e o botão vira "Baixar 3"', async () => {
  const t = await montar()
  await t.desenhar(MISTA, true, filtroTodas)
  await t.act(async () => { clicar(botao('Selecionar')) })
  assert.ok(botao('Baixar').disabled, 'nada marcado: Baixar espera')
  await t.act(async () => { caixaTodas().click() })
  assert.deepEqual(['975', '976', '977'].map(n => caixaDe(n).checked), [true, true, true])
  assert.deepEqual(['974', '978'].map(n => caixaDe(n).checked), [false, false], 'recusada e em andamento não entram')
  assert.ok(!botao('Baixar 3').disabled)
  assert.ok(caixaTodas().checked && !caixaTodas().indeterminate)
  await t.desmontar()
})

test('celular: desmarcar uma atualiza o número e deixa "Selecionar todas" indeterminada; desmarcar todas volta a 0', async () => {
  const t = await montar()
  await t.desenhar(MISTA, true, filtroTodas)
  await t.act(async () => { clicar(botao('Selecionar')) })
  await t.act(async () => { caixaTodas().click() })
  await t.act(async () => { caixaDe('976').click() })
  assert.ok(!botao('Baixar 2').disabled)
  assert.ok(caixaTodas().indeterminate && !caixaTodas().checked, 'só parte marcada')
  await t.act(async () => { caixaDe('976').click() })
  await t.act(async () => { caixaTodas().click() })
  assert.ok(botao('Baixar').disabled, 'voltou a 0')
  assert.deepEqual(['975', '976', '977'].map(n => caixaDe(n).checked), [false, false, false])
  assert.ok(!caixaTodas().indeterminate)
  await t.desmontar()
})

test('celular: "Baixar 3" chama o mesmo download em lote da tabela, com os ids das notas com documento', async () => {
  await comDownloadFalso(async chamadas => {
    const t = await montar()
    await t.desenhar(MISTA, true, filtroTodas)
    await t.act(async () => { clicar(botao('Selecionar')) })
    await t.act(async () => { caixaTodas().click() })
    await t.act(async () => { clicar(botao('Baixar 3')); await esperar(50) })
    assert.deepEqual(chamadas.map(c => [c.url, c.corpo.tipo, [...(c.corpo.id as string[])].sort()]), [['/api/notas-emitidas/arquivos', 'ambos', ['nota-2', 'nota-3', 'nota-4']]])
    await t.desmontar()
  })
})

test('celular: sem nota com documento, "Selecionar todas" fica desabilitada', async () => {
  const t = await montar()
  await t.desenhar([NOTA, EM_ANDAMENTO], true, filtroTodas)
  await t.act(async () => { clicar(botao('Selecionar')) })
  assert.ok(caixaTodas().disabled)
  await t.desmontar()
})
