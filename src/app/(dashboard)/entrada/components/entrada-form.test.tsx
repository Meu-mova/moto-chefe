// Entrada (#686): tirar motos marcadas da lista "Motos importadas" antes de registrar.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)

const enviados: { lojaId: string; motos: { chassi: string }[] }[] = []
const registrarEntradaLote = async (dados: { lojaId: string; motos: { chassi: string }[] }) => {
  enviados.push(dados)
  return { success: 'ok' }
}
const nada = async () => ({})
const acoesMock = mock.module('../actions', { namedExports: {
  registrarEntrada: nada, registrarEntradaLote, registrarEntradaNota: nada, carregarConferenciaPecas: nada,
} })

// Aviso com "Desfazer": guarda o botão do último aviso e quais avisos foram fechados.
type Acao = { label: string; onClick: () => void }
const avisos: { mensagem: string; acao?: Acao; id?: string }[] = []
const fechados: (string | undefined)[] = []
const toast = Object.assign(
  (mensagem: string, opcoes?: { action?: Acao; id?: string }) => { avisos.push({ mensagem, acao: opcoes?.action, id: opcoes?.id }) },
  { success: () => {}, error: () => {}, warning: () => {}, dismiss: (id?: string) => { fechados.push(id) } },
)
const toastMock = mock.module('sonner', { namedExports: { toast } })
after(() => { acoesMock.restore(); toastMock.restore() })

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
  enviados.length = 0
  avisos.length = 0
  fechados.length = 0
})

const modelos = [
  { id: 'm-r10', modelo: 'R10', marca: 'MotoChefe' },
  { id: 'm-x12', modelo: 'X12', marca: 'MotoChefe' },
  { id: 'm-giga', modelo: 'GIGA', marca: 'MotoChefe' },
]
const linha = (nf: string, modelo: string, chassi: string) => ({ 'NF ENTRADA': nf, MODELO: modelo, CHASSI: chassi, MOTOR: `M${chassi}`, COR: 'PRETO', 'PREÇO': '1000' })
// A lista do protótipo aprovado: NF 43440 com R10 (3) e X12 (2), NF 43512 com GIGA (2).
const PLANILHA = [
  linha('43440', 'R10', 'R1'), linha('43440', 'R10', 'R2'), linha('43440', 'R10', 'R3'),
  linha('43440', 'X12', 'X1'), linha('43440', 'X12', 'X2'),
  linha('43512', 'GIGA', 'G1'), linha('43512', 'GIGA', 'G2'),
]

async function esperar(condicao: () => boolean) {
  const { act } = await import('react')
  for (let i = 0; i < 50 && !condicao(); i++) await act(async () => { await new Promise(r => setTimeout(r, 5)) })
  assert.ok(condicao(), 'a tela não chegou ao estado esperado')
}

async function montarComPlanilha(linhas = PLANILHA) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { EntradaForm } = await import('./entrada-form')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const raiz = createRoot(container)
  raizes.push(raiz)
  await act(async () => {
    raiz.render(React.createElement(EntradaForm, { modelos, lojas: [{ id: 'l1', nome: 'Loja Centro' }] }))
  })
  await carregarPlanilha(linhas)
}

async function carregarPlanilha(linhas: object[]) {
  const { act } = await import('react')
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Motos')
  const arquivo = new dom.window.File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'motos.xlsx')
  const input = document.querySelector<HTMLInputElement>('input[accept=".xlsx,.xls"]')
  assert.ok(input)
  Object.defineProperty(input, 'files', { value: [arquivo], configurable: true })
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
  await esperar(() => !!titulo()?.startsWith(`Motos importadas (${linhas.length})`))
}

const titulo = () => [...document.querySelectorAll('h3')].map(h => h.textContent?.trim() ?? '').find(t => t.startsWith('Motos importadas'))
const botao = (inicio: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(inicio))
const caixa = (rotulo: string) => document.querySelector<HTMLInputElement>(`input[type=checkbox][aria-label="${rotulo}"]`)
const linhaDe = (chassi: string) => caixa(`Marcar ${chassi}`)?.closest('tr')
const textoDaTela = () => document.body.textContent ?? ''

async function clicar(el: Element | null | undefined) {
  const { act } = await import('react')
  assert.ok(el, 'elemento não encontrado')
  await act(async () => { (el as HTMLElement).click() })
}

test('sem nada marcado, "Excluir selecionadas (0)" fica desabilitado ao lado do Limpar', async () => {
  await montarComPlanilha()
  const excluir = botao('Excluir selecionadas')
  assert.equal(excluir?.textContent?.trim(), 'Excluir selecionadas (0)')
  assert.ok((excluir as HTMLButtonElement).disabled)
  assert.ok(botao('Limpar'))
})

test('marcar uma moto destaca a linha; excluir tira só ela e as contagens acompanham', async () => {
  await montarComPlanilha()
  await clicar(caixa('Marcar R2'))
  assert.ok(caixa('Marcar R2')?.checked)
  assert.match(linhaDe('R2')?.className ?? '', /bg-destructive/)
  assert.doesNotMatch(linhaDe('R1')?.className ?? '', /bg-destructive/)
  assert.equal(botao('Excluir selecionadas')?.textContent?.trim(), 'Excluir selecionadas (1)')

  await clicar(botao('Excluir selecionadas'))

  assert.equal(titulo(), 'Motos importadas (6)')
  assert.equal(caixa('Marcar R2'), null)
  assert.ok(caixa('Marcar R1') && caixa('Marcar R3'))
  assert.match(textoDaTela(), /NF 43440\s*4 moto\(s\)/)
  assert.match(textoDaTela(), /R10\s*2 un\./)
  assert.equal(botao('Registrar entrada')?.textContent?.trim(), 'Registrar entrada (6 motos)')
  assert.equal(botao('Excluir selecionadas')?.textContent?.trim(), 'Excluir selecionadas (0)')
})

test('a caixa do modelo marca todas dele; desmarcar uma deixa a do modelo indeterminada', async () => {
  await montarComPlanilha()
  const doModelo = () => caixa('Marcar todas as X12 da NF 43440')
  await clicar(doModelo())
  assert.ok(caixa('Marcar X1')?.checked && caixa('Marcar X2')?.checked)
  assert.ok(!caixa('Marcar R1')?.checked)
  assert.ok(doModelo()?.checked && !doModelo()?.indeterminate)
  assert.equal(botao('Excluir selecionadas')?.textContent?.trim(), 'Excluir selecionadas (2)')

  await clicar(caixa('Marcar X1'))
  assert.ok(doModelo()?.indeterminate && !doModelo()?.checked)

  await clicar(doModelo())
  await clicar(botao('Excluir selecionadas'))
  assert.equal(titulo(), 'Motos importadas (5)')
  assert.equal(doModelo(), null, 'o bloco X12 sumiu')
  assert.equal(caixa('Marcar X1'), null)
  assert.match(textoDaTela(), /NF 43440\s*3 moto\(s\)/)
})

test('Desfazer devolve as motos tiradas na mesma ordem', async () => {
  await montarComPlanilha()
  await clicar(caixa('Marcar R1'))
  await clicar(caixa('Marcar G2'))
  await clicar(botao('Excluir selecionadas'))
  assert.equal(titulo(), 'Motos importadas (5)')

  const aviso = avisos.at(-1)
  assert.equal(aviso?.mensagem, '2 motos tiradas da lista.')
  assert.equal(aviso?.acao?.label, 'Desfazer')
  const { act } = await import('react')
  await act(async () => { aviso?.acao?.onClick() })

  assert.equal(titulo(), 'Motos importadas (7)')
  const ordem = [...document.querySelectorAll<HTMLInputElement>('input[aria-label^="Marcar "]:not([aria-label^="Marcar todas"])')].map(c => c.getAttribute('aria-label'))
  assert.deepEqual(ordem, ['Marcar R1', 'Marcar R2', 'Marcar R3', 'Marcar X1', 'Marcar X2', 'Marcar G1', 'Marcar G2'])
  assert.equal(botao('Registrar entrada')?.textContent?.trim(), 'Registrar entrada (7 motos)')
})

test('excluir todas esconde a lista e o Registrar; Desfazer traz de volta', async () => {
  await montarComPlanilha()
  for (const rotulo of ['Marcar todas as R10 da NF 43440', 'Marcar todas as X12 da NF 43440', 'Marcar todas as GIGA da NF 43512']) {
    await clicar(caixa(rotulo))
  }
  await clicar(botao('Excluir selecionadas (7)'))
  assert.equal(titulo(), undefined)
  assert.equal(botao('Registrar entrada'), undefined)
  assert.equal(avisos.at(-1)?.mensagem, '7 motos tiradas da lista.')

  const { act } = await import('react')
  await act(async () => { avisos.at(-1)?.acao?.onClick() })
  assert.equal(titulo(), 'Motos importadas (7)')
})

test('Limpar fecha o Desfazer pendente, para ele não devolver motos numa lista nova', async () => {
  await montarComPlanilha()
  await clicar(caixa('Marcar R1'))
  await clicar(botao('Excluir selecionadas'))
  assert.equal(avisos.at(-1)?.mensagem, 'Moto R1 tirada da lista.')
  const idDoAviso = avisos.at(-1)?.id
  assert.ok(idDoAviso)

  await clicar(botao('Limpar'))
  assert.equal(titulo(), undefined)
  assert.ok(fechados.includes(idDoAviso), 'o aviso com Desfazer foi fechado')
})

test('planilha nova desmarca o que estava marcado', async () => {
  await montarComPlanilha()
  await clicar(caixa('Marcar R1'))
  await carregarPlanilha(PLANILHA.slice(0, 3))
  assert.ok(!caixa('Marcar R1')?.checked)
  assert.equal(botao('Excluir selecionadas')?.textContent?.trim(), 'Excluir selecionadas (0)')
})

test('"Registrar entrada" envia só as motos que ficaram na lista', async () => {
  await montarComPlanilha()
  await clicar(caixa('Marcar todas as GIGA da NF 43512'))
  await clicar(botao('Excluir selecionadas'))

  const { act } = await import('react')
  const loja = document.querySelector<HTMLSelectElement>('select[required]')
  assert.ok(loja)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')?.set
    setter?.call(loja, 'l1')
    loja.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  })
  await clicar(botao('Registrar entrada'))
  await esperar(() => enviados.length === 1)

  assert.equal(enviados[0].lojaId, 'l1')
  assert.deepEqual(enviados[0].motos.map(m => m.chassi), ['R1', 'R2', 'R3', 'X1', 'X2'])
})

test('Desfazer tira a marca feita depois da exclusão: as posições mudam e ela apontaria para outra moto', async () => {
  await montarComPlanilha()
  await clicar(caixa('Marcar R1'))
  await clicar(botao('Excluir selecionadas'))
  await clicar(caixa('Marcar R2'))

  const { act } = await import('react')
  await act(async () => { avisos.at(-1)?.acao?.onClick() })

  assert.equal(botao('Excluir selecionadas')?.textContent?.trim(), 'Excluir selecionadas (0)')
  assert.ok(!caixa('Marcar R1')?.checked && !caixa('Marcar R2')?.checked)
})
