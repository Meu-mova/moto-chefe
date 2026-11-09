// Lista da /mensalidade (#773): se a leitura das mensalidades falhou, a tela diz que não deu para
// carregar, e não "Nenhuma mensalidade em aberto." (o cliente acharia que está em dia).
import { createElement } from 'react'
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import { montarDom } from '@/test/montar-dom'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)
const acao = mock.module('./actions', { namedExports: { linkPagamentoAction: async () => ({ ok: true, url: '' }) } })
after(() => acao.restore())

const montados: (() => Promise<void>)[] = []
afterEach(async () => { for (const desmontar of montados.splice(0)) await desmontar() })

type Lista = typeof import('./lista')
type Props<K extends keyof Lista> = Parameters<Lista[K]>[0]

async function texto<K extends 'ListaMensalidades' | 'CabecalhoMensalidade'>(componente: K, props: Props<K>) {
  const { act } = await import('react')
  const { createRoot } = await import('react-dom/client')
  const lista = await import('./lista')
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await act(async () => { root.render(createElement(lista[componente] as any, props)) })
  montados.push(() => act(async () => { root.unmount(); container.remove() }))
  return container.textContent ?? ''
}
const textoDaLista = (props: Props<'ListaMensalidades'>) => texto('ListaMensalidades', props)

// Adesão em aberto da Loja Centro, vencida há 10 dias: sem multa e sem "Bloqueado" na linha.
const ADESAO = {
  m: {
    id: 'a-1', grupoId: 'g-1', tipo: 'adesao' as const, competencia: null, valor: '399.00', taxaImplantacao: '399.00', acrescimo: '0',
    vencimento: '2026-11-09', status: 'aberta' as const, mpPreferenceId: null, mpPaymentId: null, linkPagamento: null,
    pagoEm: null, criadoEm: new Date('2026-11-09T15:00:00Z'), avisoVencimentoEm: null,
  },
  grupoNome: 'Loja Centro', acrescimo: 0, total: 399,
}

test('leitura que falhou mostra o aviso de erro, não "Nenhuma mensalidade em aberto."', async () => {
  const texto = await textoDaLista({ paga: true, linhas: [], hoje: '2026-11-07', leituraFalhou: true })
  assert.ok(texto.includes('Não deu para carregar as mensalidades agora.'), `texto da lista: ${texto}`)
  assert.ok(!texto.includes('Nenhuma mensalidade em aberto.'))
})

test('leitura que deu certo e sem mensalidade em aberto continua dizendo que não há nenhuma', async () => {
  const texto = await textoDaLista({ paga: true, linhas: [], hoje: '2026-11-07', leituraFalhou: false })
  assert.equal(texto, 'Nenhuma mensalidade em aberto.')
})

test('sócio vê a linha da adesão com o valor e o Pagar, sem competência, multa nem "taxa de implantação"', async () => {
  const texto = await textoDaLista({ paga: true, linhas: [ADESAO], hoje: '2026-11-19', leituraFalhou: false })
  for (const esperado of ['Loja Centro', 'Adesão', 'Venceu em 09/11/2026', 'Em aberto', 'R$ 399,00', 'Pagar']) {
    assert.ok(texto.includes(esperado), `faltou "${esperado}" em: ${texto}`)
  }
  for (const proibido of ['Competência', 'multa', 'Bloqueado', 'implantação']) assert.ok(!texto.includes(proibido), `sobrou "${proibido}" em: ${texto}`)
})

test('quem não paga vê só que o acesso é liberado depois que o responsável pagar a adesão, sem valor', async () => {
  const texto = await textoDaLista({ paga: false, linhas: [ADESAO], hoje: '2026-11-09', leituraFalhou: false })
  assert.equal(texto, 'O acesso ao MOVA de Loja Centro é liberado depois que o responsável pagar a adesão.')
})

test('quem não paga, sem adesão em aberto, continua com o aviso de hoje', async () => {
  const texto = await textoDaLista({ paga: false, linhas: [], hoje: '2026-11-09', leituraFalhou: false })
  assert.equal(texto, 'Fale com o responsável da sua empresa para regularizar.')
})

test('cabeçalho com a adesão do grupo ativo em aberto: "Adesão ao MOVA" e o que libera o acesso', async () => {
  const t = await texto('CabecalhoMensalidade', { grupo: 'Loja Centro', adesaoEmAberto: true, bloqueado: true, totalAberto: 399, paga: true })
  assert.ok(t.startsWith('Adesão ao MOVAO acesso de Loja Centro é liberado assim que o pagamento da adesão for confirmado.'), t)
  assert.ok(t.includes('Total em aberto') && t.includes('R$ 399,00'), t)
  assert.ok(!t.includes('Acesso suspenso') && !t.includes('implantação'), t)
})

test('cabeçalho da mensalidade vencida continua "Acesso suspenso"', async () => {
  const t = await texto('CabecalhoMensalidade', { grupo: 'Loja Centro', adesaoEmAberto: false, bloqueado: true, totalAberto: 499, paga: false })
  assert.ok(t.startsWith('Acesso suspensoA mensalidade de Loja Centro está vencida há mais de 5 dias.'), t)
  assert.ok(!t.includes('R$'), t)
})
