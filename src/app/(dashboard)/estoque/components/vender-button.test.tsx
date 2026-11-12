// Vender e reservar (#775, r2): a tela decide a soma das formas pela mesma pagamentosFecham do servidor, em centavos.
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import { clicar, digitar, escolher, escolherOpcao } from '@/test/eventos-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

// Fronteira de fora: as Server Actions.
mock.module('../../vendas/actions', { namedExports: {
  registrarVendaCompletaAction: async () => ({ ok: true }), registrarReservaAction: async () => ({ ok: true }),
  buscarPrecoMinimoAction: async () => null, buscarClientePorCpfAction: async () => null,
  solicitarAprovacaoVendaAction: async () => ({ ok: true }),
} })
mock.module('@/app/(dashboard)/maquininhas-actions', { namedExports: { maquininhasDoRegistroAction: async () => [] } })

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const d of montados.splice(0)) await d() })

const campoDe = (rotulo: RegExp) =>
  [...document.querySelectorAll('label')].find(l => rotulo.test(l.textContent?.trim() ?? ''))!.parentElement!.querySelector('input')!
const botao = (texto: RegExp) => [...document.querySelectorAll('button')].find(b => texto.test(b.textContent?.trim() ?? '')) as HTMLButtonElement

async function montar(props: Record<string, unknown>) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { VenderButton } = await import('./vender-button')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(VenderButton, {
      motoId: 'moto-1', descricao: 'X11', vendedorId: 'u1', vendedorNome: 'Vendedor', papel: 'admin_socio', usuarios: [],
      origens: [{ id: 'o1', nome: 'Passou na porta', tipo: 'outro', pedeDetalhe: false }], ...props,
    }))
  })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
}

async function preencherCliente() {
  await digitar(campoDe(/^CPF\/CNPJ/), '52998224725')
  await digitar(campoDe(/^Celular/), '35999990775')
  await digitar(campoDe(/^Nome completo/), 'Cliente sintético')
  await digitar(campoDe(/^E-mail/), 'c@example.com')
}

/** Campo de valor da 1ª forma de pagamento: o último CurrencyInput depois do rótulo das formas. */
const valorDaForma = (rotuloFormas: RegExp) =>
  [...document.querySelectorAll('label')].find(l => rotuloFormas.test(l.textContent ?? ''))!.parentElement!.querySelector('input[placeholder="0,00"]') as HTMLInputElement

test('venda de R$ 1.000,00 com a forma em R$ 1.000,01 mantém o botão desabilitado; com R$ 1.000,00 habilita', async () => {
  await montar({ abrirAoMontar: true })
  await preencherCliente()
  await digitar(campoDe(/^Valor da Venda/), '100000')
  await escolherOpcao(botao(/Forma de pagamento/), 'PIX')
  await escolher([...document.querySelectorAll('select')].find(s => s.querySelector('option[value="o1"]'))!, 'o1')
  const valor = valorDaForma(/^Formas de Pagamento \*/)

  await digitar(valor, '100000')
  assert.equal(botao(/^Confirmar Venda$/).disabled, false, 'soma exata habilita')
  await digitar(valor, '100001')
  assert.equal(botao(/^Confirmar Venda$/).disabled, true, '1 centavo a mais desabilita')
})

test('reserva com entrada de R$ 1.000,00 e a forma em R$ 1.000,01 mantém o botão desabilitado; com R$ 1.000,00 habilita', async () => {
  await montar({ soReserva: true, showLabel: true })
  await clicar(document.querySelector('button[title="Registrar Reserva"]'))
  await preencherCliente()
  await digitar(campoDe(/^Valor da Entrada/), '100000')
  await digitar(campoDe(/^Valor Total da Venda/), '1000000')
  await digitar(campoDe(/^Data Prevista/), '2026-12-01')
  await escolherOpcao(botao(/Forma de pagamento/), 'PIX')
  const valor = valorDaForma(/^Formas de Pagamento da Entrada/)

  await digitar(valor, '100000')
  assert.equal(botao(/^Confirmar Reserva$/).disabled, false, 'soma exata habilita')
  await digitar(valor, '100001')
  assert.equal(botao(/^Confirmar Reserva$/).disabled, true, '1 centavo a mais desabilita')
})
