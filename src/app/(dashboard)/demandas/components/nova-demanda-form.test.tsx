// Nova demanda com sinal (#775, r2): a tela decide a soma pela mesma pagamentosFecham do servidor, em centavos.
import { createElement } from 'react'
import test, { after, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar, escolher, escolherOpcao } from '@/test/eventos-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

// Fronteira de fora: as Server Actions.
mock.module('../actions', { namedExports: { criarDemandaAction: async () => ({ ok: true }) } })
mock.module('@/app/(dashboard)/maquininhas-actions', { namedExports: { maquininhasDoRegistroAction: async () => [] } })
mock.module('../../vendas/actions', { namedExports: { buscarClientePorCpfAction: async () => null } })

const campoDe = (rotulo: RegExp) =>
  [...document.querySelectorAll('label')].find(l => rotulo.test(l.textContent ?? ''))!.parentElement!.querySelector('input')!
const botao = (texto: RegExp) => [...document.querySelectorAll('button')].find(b => texto.test(b.textContent ?? '')) as HTMLButtonElement

test('sinal de R$ 1.000,00 pago com R$ 1.000,01 mantém o envio desabilitado; com R$ 1.000,00 habilita', async () => {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { NovaDemandaForm } = await import('./nova-demanda-form')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(NovaDemandaForm, { lojas: [{ id: 'l1', nome: 'Centro' }], lojaIdFixa: 'l1', modelos: [{ id: 'm1', marca: 'M', modelo: 'X' }], cores: ['CINZA'] }))
  })
  after(() => act(async () => { root.unmount(); container.remove() }))

  const [modelo, cor] = [...document.querySelectorAll('select')]
  await escolher(modelo, 'm1')
  await escolher(cor, 'CINZA')
  await clicar(document.querySelector('input[type="checkbox"]'))
  await digitar(campoDe(/^Valor do sinal/), '100000')
  await escolherOpcao(botao(/Forma de pagamento/), 'PIX')
  await digitar(campoDe(/^Celular/), '35999990775')
  await digitar(campoDe(/^Nome completo/), 'Cliente sintético')
  await digitar(campoDe(/^CPF\/CNPJ/), '52998224725')
  const valorDaForma = [...document.querySelectorAll('input')].find(i => i.placeholder === '0,00' && i !== campoDe(/^Valor do sinal/))!
  const enviar = () => document.querySelector('button[type="submit"]') as HTMLButtonElement

  await digitar(valorDaForma, '100000')
  assert.equal(enviar().disabled, false, 'soma exata habilita')
  await digitar(valorDaForma, '100001')
  assert.equal(enviar().disabled, true, '1 centavo a mais desabilita')
})
