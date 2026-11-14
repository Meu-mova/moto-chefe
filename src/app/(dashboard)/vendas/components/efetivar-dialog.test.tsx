// Efetivação (#726): a Entrega chega pronta do pedido e a tela só a mostra para conferir.
// As Server Actions são a fronteira de fora; o resto roda de verdade.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar, escolher, escolherOpcao } from '@/test/eventos-dom'
import type { EntregaVenda } from '@/lib/notagateway/entrega'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

const enviados: unknown[][] = []
const SEM_TAXA = { taxasCartao: {}, taxasDebito: {}, taxasLink: {}, taxasFinanciamento: {} }
let precificacao: { valorMinimoPix: number; taxas: typeof SEM_TAXA } | null = null
let buscaDePreco: (() => Promise<unknown>) | null = null
const alteracoes: unknown[][] = []
let respostaDoAlterar: { ok: true; dados: undefined } | { ok: false; erro: string } = { ok: true, dados: undefined }
mock.module('../actions', { namedExports: {
  efetivarVendaAction: async (...a: unknown[]) => { enviados.push(a); return { ok: true, dados: undefined } },
  alterarEntregaDoPedidoAction: async (...a: unknown[]) => { alteracoes.push(a); return respostaDoAlterar },
  buscarPrecoMinimoAction: async () => (buscaDePreco ? buscaDePreco() : precificacao),
} })
mock.module('@/app/(dashboard)/clientes/actions', { namedExports: {
  buscarClientesAction: async () => [], criarClienteAction: async () => ({ ok: true, dados: undefined }),
} })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const desmontar of montados.splice(0)) await desmontar()
  precificacao = null; buscaDePreco = null; alteracoes.length = 0; respostaDoAlterar = { ok: true, dados: undefined }
})

const entregaNaTela = () => document.querySelector('[aria-label="Entrega do pedido"]')?.textContent ?? ''

async function abrir(entrega: EntregaVenda | null, origens: { id: string; nome: string; tipo: string; pedeDetalhe: boolean }[] = [], quem = { papel: 'aux_adm', podeAprovarSensivel: false }) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { EfetivarDialog } = await import('./efetivar-dialog')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(EfetivarDialog, { pedidoId: 'p1', motoId: 'm1', chassi: 'LA1', modelo: 'MC JET', origens, entrega, ...quem })) })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
  await clicar([...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Efetivar Venda'))
}

const ENTREGAR: EntregaVenda = {
  modo: 'entregar', modalidade: 'TransporteProprioPorContaDoRemetente',
  endereco: { cep: '65000000', logradouro: 'Rua de exemplo', numero: '100', complemento: '', bairro: 'Centro', cidade: '2111300', nomeCidade: 'São Luís', uf: 'MA' },
  recebe: null,
}

test('"Entregar" do pedido: endereço, quem recebe (o comprador) e a modalidade, só para conferir', async () => {
  await abrir(ENTREGAR)
  const texto = entregaNaTela()
  assert.match(texto, /Entregar em São Luís\/MA \(do pedido\)/)
  assert.match(texto, /Rua de exemplo, 100, Centro, São Luís\/MA, CEP 65000-000/)
  assert.match(texto, /Quem recebe: o comprador/)
  assert.match(texto, /Modalidade: Loja leva com veículo próprio/)
})

test('outra pessoa recebe: a efetivação mostra o nome dela', async () => {
  await abrir({ ...ENTREGAR, recebe: { nome: 'Maria Exemplo', cpfCnpj: '52998224725' } } as EntregaVenda)
  assert.match(entregaNaTela(), /Quem recebe: Maria Exemplo/)
})

test('"Retira na loja" do pedido e pedido antigo sem Entrega', async () => {
  await abrir({ modo: 'retira', modalidade: '' })
  assert.match(entregaNaTela(), /Retira na loja \(do pedido\)/)
  assert.match(entregaNaTela(), /Modalidade: não escolhida/)
  for (const d of montados.splice(0)) await d()
  await abrir(null)
  assert.match(entregaNaTela(), /Pedido sem a Entrega informada/)
})

// Frete cobrado (#726, 4b): a efetivação mostra o frete do pedido e o total; o servidor soma o frete do pedido.
test('pedido com frete: mostra o frete cobrado, pede o valor da moto e soma o total', async () => {
  await abrir({ ...ENTREGAR, frete: 350 } as EntregaVenda)
  assert.match(entregaNaTela(), /Frete cobrado: R\$\s*350,00/)
  const rotulo = [...document.querySelectorAll('label')].find(l => /^Valor da moto/.test(l.textContent ?? ''))
  assert.ok(rotulo, 'o campo de valor diz que é o valor da moto')
  const campo = rotulo.parentElement!.querySelector('input')!
  await digitar(campo, '1000000')
  assert.match(document.body.textContent ?? '', /Total \(moto \+ frete\): R\$\s*10\.350,00/)
})

test('pedido sem frete continua com "Valor (R$)" e sem total à parte', async () => {
  await abrir(ENTREGAR)
  assert.ok([...document.querySelectorAll('label')].some(l => (l.textContent ?? '') === 'Valor (R$)'))
  assert.doesNotMatch(document.body.textContent ?? '', /Total \(moto \+ frete\)/)
})

// Pagamento do pedido (#775): a tela de hoje tem uma forma só e manda uma lista com ela, valendo moto + frete.
test('efetivar manda a forma escolhida como lista de um pagamento, com o total (moto + frete)', async () => {
  enviados.splice(0)
  await abrir({ ...ENTREGAR, frete: 350 } as EntregaVenda, [{ id: 'o1', nome: 'Passou na porta', tipo: 'outro', pedeDetalhe: false }])
  const campoDe = (rotulo: RegExp) => [...document.querySelectorAll('label')].find(l => rotulo.test(l.textContent ?? ''))!.parentElement!.querySelector('input')!
  await digitar(campoDe(/^Nome do Cliente/), 'Cliente sintético')
  await digitar(campoDe(/^CPF\/CNPJ/), '52998224725')
  await digitar(campoDe(/^Valor da moto/), '1000000')
  await escolher(document.querySelector('select')!, 'o1')
  await escolherOpcao([...document.querySelectorAll('button')].find(b => /Selecionar/.test(b.textContent ?? '')), 'Dinheiro')
  await clicar([...document.querySelectorAll('button')].find(b => b.textContent?.trim() === 'Confirmar Venda'))
  assert.equal(enviados.length, 1)
  assert.deepEqual(enviados[0].slice(3, 5), ['10000.00', [{ tipo: 'dinheiro', valor: 10350 }]])
})

// Preço mínimo e aprovação (#776): a tela decide pela mesma função do servidor.
const ORIGEM = [{ id: 'o1', nome: 'Passou na porta', tipo: 'outro', pedeDetalhe: false }]
const botao = (texto: string) => [...document.querySelectorAll('button')].find(b => b.textContent?.trim() === texto) as HTMLButtonElement | undefined
async function preencher(valor: string, forma: string) {
  const campoDe = (rotulo: RegExp) => [...document.querySelectorAll('label')].find(l => rotulo.test(l.textContent ?? ''))!.parentElement!.querySelector('input')!
  await digitar(campoDe(/^Nome do Cliente/), 'Cliente sintético')
  await digitar(campoDe(/^CPF\/CNPJ/), '52998224725')
  await digitar(campoDe(/^Valor/), valor)
  await escolher(document.querySelector('select')!, 'o1')
  await escolherOpcao([...document.querySelectorAll('button')].find(b => /Selecionar/.test(b.textContent ?? '')), forma)
}

test('abaixo do mínimo: avisa, pede o motivo e manda o motivo junto ao pedir aprovação', async () => {
  enviados.splice(0)
  precificacao = { valorMinimoPix: 12000, taxas: SEM_TAXA }
  await abrir(ENTREGAR, ORIGEM)
  await preencher('1190000', 'PIX')
  assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /Abaixo do preço mínimo/)
  assert.equal(botao('Pedir aprovação')?.disabled, true)
  const { digitarTexto } = await import('@/test/eventos-dom')
  await digitarTexto(document.querySelector('#efetivar-motivo') as HTMLTextAreaElement, 'Cliente fiel')
  await clicar(botao('Pedir aprovação'))
  assert.equal(enviados.length, 1)
  assert.equal(enviados[0][8], 'Cliente fiel')
})

test('com frete, a moto no mínimo não pede aprovação (o frete não conta)', async () => {
  precificacao = { valorMinimoPix: 12000, taxas: SEM_TAXA }
  await abrir({ ...ENTREGAR, frete: 150 } as EntregaVenda, ORIGEM)
  await preencher('1200000', 'PIX')
  assert.equal(document.querySelector('[role="status"]'), null)
  assert.ok(botao('Confirmar Venda'))
  // Contraprova com a precificação carregada: 1 real abaixo na moto, mesmo com o frete, avisa.
  const valor = [...document.querySelectorAll('label')].find(l => /^Valor da moto/.test(l.textContent ?? ''))!.parentElement!.querySelector('input')!
  await digitar(valor, '1199900')
  assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /Abaixo do preço mínimo/)
})

test('transferência sem a permissão pede aprovação sem exigir motivo; com a permissão, efetiva', async () => {
  await abrir(ENTREGAR, ORIGEM)
  await preencher('1200000', 'Transferência bancária')
  assert.match(document.querySelector('[role="status"]')?.textContent ?? '', /Transferência bancária precisa de aprovação/)
  assert.equal(botao('Pedir aprovação')?.disabled, false)
  for (const d of montados.splice(0)) await d()
  await abrir(ENTREGAR, ORIGEM, { papel: 'aux_adm', podeAprovarSensivel: true })
  await preencher('1200000', 'Transferência bancária')
  assert.equal(document.querySelector('[role="status"]'), null)
  assert.equal(botao('Confirmar Venda')?.disabled, false)
})

test('sócio abaixo do mínimo efetiva direto, como no servidor', async () => {
  precificacao = { valorMinimoPix: 12000, taxas: SEM_TAXA }
  await abrir(ENTREGAR, ORIGEM, { papel: 'admin_socio', podeAprovarSensivel: false })
  await preencher('1000000', 'PIX')
  assert.equal(document.querySelector('[role="status"]'), null)
  assert.equal(botao('Confirmar Venda')?.disabled, false)
})

test('o botão espera a precificação chegar; se a busca falhar, libera e o servidor decide', async () => {
  let chegar: (v: unknown) => void = () => {}
  buscaDePreco = () => new Promise(r => { chegar = r })
  await abrir(ENTREGAR, ORIGEM)
  await preencher('1000000', 'PIX')
  assert.equal(botao('Confirmar Venda')?.disabled, true)
  const { act } = await import('react')
  await act(async () => { chegar({ valorMinimoPix: 12000, taxas: SEM_TAXA }) })
  assert.equal(botao('Pedir aprovação')?.disabled, true, 'abaixo do mínimo: agora pede o motivo')
  for (const d of montados.splice(0)) await d()
  buscaDePreco = async () => { throw new Error('rede') }
  await abrir(ENTREGAR, ORIGEM)
  await preencher('1000000', 'PIX')
  assert.equal(botao('Confirmar Venda')?.disabled, false)
})

// "Alterar" (#895): o mesmo bloco do Novo pedido num diálogo; a Entrega muda no pedido e o total segue o frete novo.
const dialogoAlterar = () => document.querySelector('[aria-label="Alterar entrega"]')

test('"Alterar" abre a Entrega do pedido preenchida; trocar para "Retira na loja" envia ao pedido e a efetivação mostra a nova', async () => {
  await abrir(ENTREGAR)
  await clicar(botao('Alterar'))
  assert.ok(dialogoAlterar(), 'o diálogo "Alterar entrega" abriu')
  const rua = document.getElementById('entrega-logradouro') as HTMLInputElement
  assert.equal(rua.value, 'Rua de exemplo')
  await clicar(document.querySelector('input[name="pedido-entrega"][value="retira"]'))
  await clicar(botao('Salvar entrega'))
  assert.deepEqual(alteracoes, [['p1', { modo: 'retira', modalidade: 'TransporteProprioPorContaDoRemetente' }]])
  assert.equal(dialogoAlterar(), null)
  assert.match(entregaNaTela(), /Retira na loja \(do pedido\)/)
})

test('"Alterar" na efetivação pode ligar o frete: vai ao pedido e o total passa a somar o frete novo', async () => {
  await abrir(ENTREGAR)
  await clicar(botao('Alterar'))
  await clicar(botao('+ Frete'))
  await digitar(document.querySelector<HTMLInputElement>('[aria-label="Alterar entrega"] #alterar-frete')!, '35000')
  await clicar(botao('Salvar entrega'))
  assert.deepEqual(alteracoes, [['p1', { ...ENTREGAR, frete: 350 }]])
  const rotulo = [...document.querySelectorAll('label')].find(l => /^Valor da moto/.test(l.textContent ?? ''))!
  await digitar(rotulo.parentElement!.querySelector('input')!, '100000')
  assert.match(document.body.textContent ?? '', /Total \(moto \+ frete\): R\$\s*1\.350,00/)
})

test('recusa do servidor no "Alterar" fica no diálogo e a Entrega do pedido não muda', async () => {
  respostaDoAlterar = { ok: false, erro: 'Pedido aguardando aprovação: recuse ou aprove antes de mudar a entrega.' }
  await abrir(ENTREGAR)
  await clicar(botao('Alterar'))
  await clicar(document.querySelector('input[name="pedido-entrega"][value="retira"]'))
  await clicar(botao('Salvar entrega'))
  assert.match(dialogoAlterar()?.textContent ?? '', /Pedido aguardando aprovação/)
  assert.match(entregaNaTela(), /Entregar em São Luís\/MA \(do pedido\)/)
})
