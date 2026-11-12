// Sinal da demanda (#775, r2): a tela decide a soma pela mesma pagamentosFecham do servidor, em centavos.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar, escolherOpcao } from '@/test/eventos-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

// Fronteira de fora: as Server Actions.
mock.module('../actions', { namedExports: { marcarSinalDemandaAction: async () => undefined, desmarcarSinalDemandaAction: async () => undefined } })
mock.module('@/app/(dashboard)/maquininhas-actions', { namedExports: { maquininhasDoRegistroAction: async () => [] } })
mock.module('../../vendas/actions', { namedExports: { buscarClientePorCpfAction: async () => null } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const d of montados.splice(0)) await d() })

const campoDe = (rotulo: RegExp) =>
  [...document.querySelectorAll('label')].find(l => rotulo.test(l.textContent ?? ''))!.parentElement!.querySelector('input')!
const botao = (texto: RegExp) => [...document.querySelectorAll('button')].find(b => texto.test(b.textContent ?? '')) as HTMLButtonElement

test('sinal de R$ 1.000,00 pago com R$ 1.000,01 mantém o botão desabilitado; com R$ 1.000,00 habilita', async () => {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { MarcarSinalButton } = await import('./marcar-sinal-button')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => { root.render(createElement(MarcarSinalButton, { demandaId: 'd1', sinalRecebido: false, valorSinal: null, isAdmin: false })) })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
  await clicar(botao(/^Marcar sinal$/))

  await digitar(campoDe(/^Valor do sinal/), '100000')
  await escolherOpcao(botao(/Forma de pagamento/), 'PIX')
  await digitar(campoDe(/^Celular/), '35999990775')
  await digitar(campoDe(/^Nome completo/), 'Cliente sintético')
  await digitar(campoDe(/^CPF\/CNPJ/), '52998224725')
  const valorDaForma = [...document.querySelectorAll('input')].find(i => i.placeholder === '0,00' && i !== campoDe(/^Valor do sinal/))!

  await digitar(valorDaForma, '100000')
  assert.equal(botao(/Confirmar sinal/).disabled, false, 'soma exata habilita')
  await digitar(valorDaForma, '100001')
  assert.equal(botao(/Confirmar sinal/).disabled, true, '1 centavo a mais desabilita')
})
