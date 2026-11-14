// Cadastro rápido de cliente na busca (efetivar venda, #404): o que envia, a recusa do servidor na
// tela e a falha sem resposta. As actions e o aviso (sonner) são a fronteira de fora.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar } from '@/test/eventos-dom'
import { botao, dialogoAberto, esperar, DEPOIS_DA_ANIMACAO_MS } from '@/test/dialogo-em-tela'
import type { ClienteInput } from '../actions'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

type Criado = { ok: true; id: string } | { ok: false; erro: string }
const criar = mock.fn(async (_dados: ClienteInput): Promise<Criado> => ({ ok: true, id: 'c-1' }))
mock.module('../actions', { namedExports: {
  buscarClientesAction: async () => [],
  criarClienteAction: (dados: ClienteInput) => criar(dados),
} })
const erros: string[] = []
const sucessos: string[] = []
mock.module('sonner', { namedExports: { toast: { error: (m: string) => { erros.push(m) }, success: (m: string) => { sucessos.push(m) } } } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const desmontar of montados.splice(0)) await desmontar()
  criar.mock.resetCalls()
  criar.mock.mockImplementation(async () => ({ ok: true, id: 'c-1' }))
  erros.length = 0
  sucessos.length = 0
})

const campo = (id: string) => document.getElementById(id) as HTMLInputElement
// A busca espera 300 ms depois da última tecla antes de chamar o servidor.
const DEPOIS_DA_BUSCA_MS = 400

async function montarNoCadastroRapido() {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ClienteBusca } = await import('./cliente-busca')
  const onSelect = mock.fn((_id: string, _nome: string, _cpf: string | null) => {})
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(ClienteBusca, { onSelect })) })
  const clique = async (el: Element | undefined, ms = 50) => { await clicar(el); await act(() => esperar(ms)) }
  let montado = true
  montados.push(() => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() }))
  await digitar(container.querySelector('input')!, 'Ana')
  await act(() => esperar(DEPOIS_DA_BUSCA_MS))
  await clique(botao('Cadastrar novo cliente'))
  await digitar(campo('novo-nome'), ' Ana Souza ')
  await digitar(campo('novo-cpf'), '529.982.247-25')
  await digitar(campo('novo-celular'), '(35) 99999-0000')
  return { clique, onSelect }
}

test('cadastro rápido: envia o preenchido, escolhe o cliente criado e fecha', async () => {
  const t = await montarNoCadastroRapido()
  await t.clique(botao('Salvar'), DEPOIS_DA_ANIMACAO_MS)
  assert.deepEqual(criar.mock.calls.map(c => c.arguments), [[{
    nome: 'Ana Souza', tipoPessoa: 'fisica', cpfCnpj: '529.982.247-25', celular: '(35) 99999-0000', sexo: 'nao_identificado',
  }]])
  assert.deepEqual(t.onSelect.mock.calls.map(c => c.arguments), [['c-1', 'Ana Souza', '529.982.247-25']])
  assert.deepEqual(sucessos, ['Cliente cadastrado com sucesso'])
  assert.ok(!dialogoAberto())
})

test('cadastro rápido: recusa do servidor aparece, nada é escolhido e o diálogo fica aberto com o preenchido', async () => {
  criar.mock.mockImplementation(async () => ({ ok: false, erro: 'CPF/CNPJ já cadastrado' }))
  const t = await montarNoCadastroRapido()
  await t.clique(botao('Salvar'), DEPOIS_DA_ANIMACAO_MS)
  assert.deepEqual(erros, ['CPF/CNPJ já cadastrado'])
  assert.deepEqual(sucessos, [])
  assert.equal(t.onSelect.mock.callCount(), 0)
  assert.ok(dialogoAberto())
  assert.equal(campo('novo-cpf').value, '529.982.247-25')
  assert.ok(!botao('Salvar')!.disabled)
})

test('cadastro rápido: falha sem resposta mostra frase fixa, não a mensagem crua', async () => {
  criar.mock.mockImplementation(async () => { throw new Error('An error occurred in the Server Components render') })
  const t = await montarNoCadastroRapido()
  await t.clique(botao('Salvar'))
  assert.deepEqual(erros, ['Não consegui salvar agora. Tente de novo.'])
  assert.ok(dialogoAberto())
  assert.ok(!botao('Salvar')!.disabled)
})
