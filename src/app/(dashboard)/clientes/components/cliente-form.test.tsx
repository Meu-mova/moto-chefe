// Diálogo Novo/Editar Cliente (#404): o que envia, a recusa do servidor na tela e a falha sem
// resposta. As actions e o aviso (sonner) são a fronteira de fora; o resto roda de verdade.
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
type Salvo = { ok: true } | { ok: false; erro: string }
const criar = mock.fn(async (_dados: ClienteInput): Promise<Criado> => ({ ok: true, id: 'c-1' }))
const atualizar = mock.fn(async (_id: string, _dados: Partial<ClienteInput>): Promise<Salvo> => ({ ok: true }))
mock.module('../actions', { namedExports: {
  criarClienteAction: (dados: ClienteInput) => criar(dados),
  atualizarClienteAction: (id: string, dados: Partial<ClienteInput>) => atualizar(id, dados),
} })
const erros: string[] = []
const sucessos: string[] = []
mock.module('sonner', { namedExports: { toast: { error: (m: string) => { erros.push(m) }, success: (m: string) => { sucessos.push(m) } } } })
const refresh = mock.fn()
mock.module('next/navigation', { namedExports: { useRouter: () => ({ refresh }) } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const desmontar of montados.splice(0)) await desmontar()
  for (const f of [criar, atualizar, refresh]) f.mock.resetCalls()
  criar.mock.mockImplementation(async () => ({ ok: true, id: 'c-1' }))
  atualizar.mock.mockImplementation(async () => ({ ok: true }))
  erros.length = 0
  sucessos.length = 0
})

// Campo pelo rótulo visível: o Label do formulário não tem htmlFor, o input mora no mesmo bloco.
const campo = (rotulo: string) => {
  const label = [...document.querySelectorAll('label')].find(l => (l.textContent ?? '').trim() === rotulo)
  return label!.parentElement!.querySelector('input') as HTMLInputElement
}

const CLIENTE = {
  id: 'c-9', nome: 'Ana Souza', tipoPessoa: 'fisica' as const, cpfCnpj: '52998224725', sexo: 'feminino' as const,
  email: null, celular: '35999990000', endereco: null, numero: null, complemento: null, bairro: null, cep: null, cidade: 'Varginha', uf: 'MG',
}

async function montar(props: { clienteInicial?: typeof CLIENTE } = {}) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { ClienteForm } = await import('./cliente-form')
  const onCreated = mock.fn((_id: string) => {})
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(ClienteForm, { trigger: createElement('button', null, 'Abrir'), onCreated, ...props })) })
  const clique = async (el: Element | undefined, ms = 50) => { await clicar(el); await act(() => esperar(ms)) }
  let montado = true
  montados.push(() => act(async () => { if (!montado) return; montado = false; root.unmount(); container.remove() }))
  await clique(botao('Abrir'))
  return { clique, onCreated }
}

test('Novo Cliente: envia o preenchido, avisa, devolve o id e fecha', async () => {
  const t = await montar()
  await digitar(campo('Nome *'), 'Ana Souza')
  await digitar(campo('CPF/CNPJ'), '529.982.247-25')
  await t.clique(botao('Salvar'), DEPOIS_DA_ANIMACAO_MS)
  assert.equal(criar.mock.callCount(), 1)
  const enviado = criar.mock.calls[0].arguments[0]
  assert.equal(enviado.nome, 'Ana Souza')
  assert.equal(enviado.cpfCnpj, '529.982.247-25')
  assert.equal(enviado.tipoPessoa, 'fisica')
  assert.deepEqual(t.onCreated.mock.calls.map(c => c.arguments), [['c-1']])
  assert.deepEqual(sucessos, ['Cliente cadastrado!'])
  assert.ok(!dialogoAberto())
})

test('Novo Cliente: recusa do servidor aparece e o diálogo fica aberto com o preenchido', async () => {
  criar.mock.mockImplementation(async () => ({ ok: false, erro: 'CPF/CNPJ já cadastrado' }))
  const t = await montar()
  await digitar(campo('Nome *'), 'Ana Souza')
  await digitar(campo('CPF/CNPJ'), '529.982.247-25')
  await t.clique(botao('Salvar'), DEPOIS_DA_ANIMACAO_MS)
  assert.deepEqual(erros, ['CPF/CNPJ já cadastrado'])
  assert.deepEqual(sucessos, [])
  assert.equal(t.onCreated.mock.callCount(), 0)
  assert.ok(dialogoAberto())
  assert.equal(campo('CPF/CNPJ').value, '529.982.247-25')
  assert.ok(!botao('Salvar')!.disabled)
})

test('Editar Cliente: envia o id e o formulário editado; recusa aparece e o diálogo fica aberto', async () => {
  atualizar.mock.mockImplementation(async () => ({ ok: false, erro: 'Cliente não encontrado' }))
  const t = await montar({ clienteInicial: CLIENTE })
  await digitar(campo('Nome *'), 'Ana Souza Lima')
  await t.clique(botao('Salvar'), DEPOIS_DA_ANIMACAO_MS)
  assert.deepEqual(atualizar.mock.calls.map(c => c.arguments), [['c-9', { ...CLIENTE, nome: 'Ana Souza Lima' }]])
  assert.deepEqual(erros, ['Cliente não encontrado'])
  assert.deepEqual(sucessos, [])
  assert.ok(dialogoAberto())
})

test('falha sem resposta (rede, sessão) mostra frase fixa, não a mensagem crua, e libera o Salvar', async () => {
  criar.mock.mockImplementation(async () => { throw new Error('An error occurred in the Server Components render') })
  const t = await montar()
  await digitar(campo('Nome *'), 'Ana Souza')
  await t.clique(botao('Salvar'))
  assert.deepEqual(erros, ['Não consegui salvar agora. Tente de novo.'])
  assert.ok(dialogoAberto())
  assert.ok(!botao('Salvar')!.disabled)
})
