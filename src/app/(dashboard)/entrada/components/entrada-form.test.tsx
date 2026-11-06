// Entrada (#686): tirar motos marcadas da lista "Motos importadas" antes de registrar.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import * as XLSX from 'xlsx'
import { montarDom } from '@/test/montar-dom'

const { dom, desmontar } = montarDom()
after(desmontar)

// O que cada "Registrar entrada" mandou ao servidor, e por qual action.
type Envio = { lojaId: string; motos: { chassi: string }[]; fiscais?: { chassi: string; emitente: { nfNumero: string } }[] }
const enviados: { action: 'lote' | 'nota'; dados: Envio }[] = []
let respostaDoEnvio: { success?: string; error?: string } = { success: 'ok' }
const registrarEntradaLote = async (dados: Envio) => { enviados.push({ action: 'lote', dados }); return respostaDoEnvio }
const registrarEntradaNota = async (dados: Envio) => { enviados.push({ action: 'nota', dados }); return respostaDoEnvio }
// Conferência de peças: o item da nota já tem peça no catálogo, então a linha entra sem correção.
const carregarConferenciaPecas = async () => ({
  conferencia: { pecas: [{ id: 'p1', nome: 'Carregador', valor: '50.00' }], sugestoes: ['p1'], notaJaLancada: null },
})
const acoesMock = mock.module('../actions', { namedExports: {
  registrarEntrada: async () => ({}), registrarEntradaLote, registrarEntradaNota, carregarConferenciaPecas,
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
  respostaDoEnvio = { success: 'ok' }
  avisos.length = 0
  fechados.length = 0
})

const modelos = [
  { id: 'm-r10', modelo: 'R10', marca: 'MotoChefe' },
  { id: 'm-x12', modelo: 'X12', marca: 'MotoChefe' },
  { id: 'm-giga', modelo: 'GIGA', marca: 'MotoChefe' },
]

// NF-e mínima: motos nas Informações Complementares, um <det> de moto (NCM 8711) e, se pedido,
// um de peça. Chassis e números são fictícios.
const detMoto = (qtd: number) => `<det nItem="1"><prod><cProd>GIGA</cProd><xProd>GIGA MOTO CHEFE</xProd><NCM>87116000</NCM><CFOP>5405</CFOP><uCom>UN</uCom><qCom>${qtd}.0000</qCom><vUnCom>6400.00</vUnCom><vProd>6400.00</vProd></prod><imposto><ICMS><ICMS60><orig>4</orig><CST>60</CST></ICMS60></ICMS></imposto></det>`
const detPeca = `<det nItem="2"><prod><cProd>CARR</cProd><xProd>Carregador 60V</xProd><NCM>85044010</NCM><CFOP>5102</CFOP><uCom>UN</uCom><qCom>1.0000</qCom><vUnCom>50.00</vUnCom><vProd>50.00</vProd></prod><imposto><ICMS><ICMS00><orig>0</orig><CST>00</CST></ICMS00></ICMS></imposto></det>`
function notaXml(nNF: string, chassis: string[], comPeca = false) {
  const infCpl = chassis.map(c => `GIGA C/ BAU 1000W ${c} QS60V30H${c.slice(-8)} AZUL`).join(';')
  return `<?xml version="1.0"?><nfeProc><NFe><infNFe Id="NFe${nNF.padStart(44, '0')}"><ide><nNF>${nNF}</nNF></ide>` +
    `<emit><CNPJ>00000000000191</CNPJ><xNome>Fabrica Teste</xNome></emit>${detMoto(chassis.length)}${comPeca ? detPeca : ''}` +
    `<infAdic><infCpl>${infCpl}</infCpl></infAdic></infNFe></NFe></nfeProc>`
}
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

async function montar() {
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
}

async function montarComPlanilha(linhas = PLANILHA) {
  await montar()
  await carregarPlanilha(linhas)
}

async function enviarArquivos(seletor: string, arquivos: File[]) {
  const { act } = await import('react')
  const input = document.querySelector<HTMLInputElement>(seletor)
  assert.ok(input)
  Object.defineProperty(input, 'files', { value: arquivos, configurable: true })
  await act(async () => { input.dispatchEvent(new dom.window.Event('change', { bubbles: true })) })
}

async function carregarXml(xml: string, motosNaLista: number) {
  await enviarArquivos('input[accept=".xml"]', [new dom.window.File([xml], 'nota.xml', { type: 'text/xml' })])
  await esperar(() => titulo() === `Motos importadas (${motosNaLista})`)
}

async function escolherLoja() {
  const { act } = await import('react')
  const loja = document.querySelector<HTMLSelectElement>('select[required]')
  assert.ok(loja)
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLSelectElement.prototype, 'value')?.set
    setter?.call(loja, 'l1')
    loja.dispatchEvent(new dom.window.Event('change', { bubbles: true }))
  })
}

async function carregarPlanilha(linhas: object[]) {
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(linhas), 'Motos')
  const arquivo = new dom.window.File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' })], 'motos.xlsx')
  await enviarArquivos('input[accept=".xlsx,.xls"]', [arquivo])
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

  await escolherLoja()
  await clicar(botao('Registrar entrada'))
  await esperar(() => enviados.length === 1)

  assert.equal(enviados[0].dados.lojaId, 'l1')
  assert.deepEqual(enviados[0].dados.motos.map(m => m.chassi), ['R1', 'R2', 'R3', 'X1', 'X2'])
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

test('XML excluído e a NF certa importada depois: a ficha fiscal enviada é só a da NF que ficou', async () => {
  await montar()
  await carregarXml(notaXml('111', ['TESTE0000GG000001']), 1)
  await clicar(caixa('Marcar TESTE0000GG000001'))
  await clicar(botao('Excluir selecionadas'))
  await carregarXml(notaXml('222', ['TESTE0000GG000001']), 1)

  await escolherLoja()
  await clicar(botao('Registrar entrada'))
  await esperar(() => enviados.length === 1)

  assert.deepEqual(enviados[0].dados.fiscais?.map(f => [f.chassi, f.emitente.nfNumero]), [['TESTE0000GG000001', '222']])
})

test('XML acrescentado depois de marcar não muda o que está marcado; excluir tira só a marcada', async () => {
  await montar()
  await carregarXml(notaXml('111', ['TESTE0000GG000001', 'TESTE0000GG000002']), 2)
  await clicar(caixa('Marcar TESTE0000GG000002'))
  await carregarXml(notaXml('222', ['TESTE0000GG000003']), 3)

  assert.ok(caixa('Marcar TESTE0000GG000002')?.checked)
  assert.ok(!caixa('Marcar TESTE0000GG000003')?.checked)
  await clicar(botao('Excluir selecionadas (1)'))

  await escolherLoja()
  await clicar(botao('Registrar entrada'))
  await esperar(() => enviados.length === 1)
  assert.deepEqual(enviados[0].dados.motos.map(m => m.chassi), ['TESTE0000GG000001', 'TESTE0000GG000003'])
  assert.deepEqual(enviados[0].dados.fiscais?.map(f => f.chassi), ['TESTE0000GG000001', 'TESTE0000GG000003'])
})

test('nota com motos e peças: o registro da nota leva só as motos que ficaram e as fichas delas', async () => {
  await montar()
  await carregarXml(notaXml('333', ['TESTE0000GG000001', 'TESTE0000GG000002'], true), 2)
  await clicar(caixa('Marcar TESTE0000GG000001'))
  await clicar(botao('Excluir selecionadas'))
  await escolherLoja()
  await esperar(() => botao('Registrar entrada')?.textContent?.trim() === 'Registrar entrada (1 motos e 1 peças)')

  await clicar(botao('Registrar entrada'))
  await esperar(() => enviados.length === 1)
  assert.equal(enviados[0].action, 'nota')
  assert.deepEqual(enviados[0].dados.motos.map(m => m.chassi), ['TESTE0000GG000002'])
  assert.deepEqual(enviados[0].dados.fiscais?.map(f => f.chassi), ['TESTE0000GG000002'])
})

test('erro do servidor no registro: a lista fica como estava, sem as motos excluídas', async () => {
  respostaDoEnvio = { error: 'Falhou' }
  await montarComPlanilha()
  await clicar(caixa('Marcar G1'))
  await clicar(botao('Excluir selecionadas'))
  await escolherLoja()
  await clicar(botao('Registrar entrada'))
  await esperar(() => enviados.length === 1 && botao('Registrar entrada') !== undefined && !botao('Registrar entrada')?.textContent?.includes('Registrando'))

  assert.equal(titulo(), 'Motos importadas (6)')
  assert.equal(caixa('Marcar G1'), null)
  assert.equal(botao('Registrar entrada')?.textContent?.trim(), 'Registrar entrada (6 motos)')
})
