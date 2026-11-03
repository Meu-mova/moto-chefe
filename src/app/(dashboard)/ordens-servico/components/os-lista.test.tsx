// Lista de OS: a tabela do desktop mostra a conciliação, como os cartões e o resumo já mostravam.
import test, { after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'
import type { OSComDetalhes } from '@/lib/queries/ordens-servico'

const { desmontar } = montarDom()
after(desmontar)

const raizes: { unmount(): void }[] = []
afterEach(async () => {
  const { act } = await import('react')
  await act(async () => { for (const r of raizes.splice(0)) r.unmount() })
  document.body.innerHTML = ''
})

async function montar(lista: OSComDetalhes[]) {
  const React = (await import('react')).default
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const { OSLista } = await import('./os-lista')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const raiz = createRoot(container)
  raizes.push(raiz)
  await act(async () => { raiz.render(React.createElement(OSLista, { lista })) })
}

const os = (numero: number, campos: Partial<OSComDetalhes>) => ({
  id: `os-${numero}`, numero, status: 'concluida', dataAbertura: new Date('2026-11-01T12:00:00Z'), dataPrevisao: null,
  lojaNome: 'Loja', chassi: null, marca: null, modelo: null, marcaExterna: 'M', modeloExterno: 'X',
  clienteNome: 'Cliente', clienteNomeExterno: null, mecanicoNome: null, servicosResumo: null,
  formaPagamento: null, pagamentos: [], valorTotal: '100.00', conciliadoValor: 0, pixConciliadoValor: 0,
  ...campos,
}) as unknown as OSComDetalhes

/** Texto da coluna Conciliação de cada linha da tabela do desktop, pelo cabeçalho. */
function colunaConciliacao() {
  const tabela = document.querySelector('table')!
  const cabecalhos = [...tabela.querySelectorAll('thead th')].map(th => th.textContent?.trim())
  const i = cabecalhos.indexOf('Conciliação')
  assert.ok(i >= 0, `sem coluna Conciliação: ${cabecalhos.join(', ')}`)
  return [...tabela.querySelectorAll('tbody tr')].map(tr => tr.querySelectorAll('td')[i]?.textContent?.trim())
}

test('tabela: conciliada, pendente, parcial e sem o que conciliar', async () => {
  await montar([
    os(1, { pagamentos: [{ tipo: 'pix', valor: 100 }], pixConciliadoValor: 100 }),
    os(2, { pagamentos: [{ tipo: 'cartao_credito', valor: 100 }] }),
    os(3, { pagamentos: [{ tipo: 'cartao_credito', valor: 60 }, { tipo: 'pix', valor: 40 }], pixConciliadoValor: 40 }),
    os(4, { status: 'cancelada', pagamentos: [{ tipo: 'pix', valor: 100 }] }),
    os(5, { status: 'aberta', valorTotal: null }),
  ])
  assert.deepEqual(colunaConciliacao(), ['OK', 'Pendente', 'Parcial', '—', '—'])
})
