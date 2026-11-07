// Diálogo "Remover moto" (#692, variante B do protótipo): o que cada passo mostra, o que envia e a
// trava enquanto envia. As actions são a fronteira de fora; o resto roda de verdade.
import test, { after, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import type { ResultadoAction } from '@/lib/resultado-action'
import type { SaiJunto } from '@/lib/remover-moto-regras'
import { montarDom } from '@/test/montar-dom'
import { apertarEscape, botao, caixa, clicar, DEPOIS_DA_ANIMACAO_MS, esperar, montarDialogo, textoDaTela } from '@/test/dialogo-em-tela'

const { desmontar: desmontarDom } = montarDom()
after(desmontarDom)

type Moto = { id: string; chassi: string; modelo: string; loja: string; nfEntrada: string | null; bloqueio: string | null; saiJunto: SaiJunto; pecasEmOs: number; mesmaNf: string[] }
// As três da NF 43440 estão no mesmo grupo: cada uma lista as outras duas em mesmaNf.
const DA_43440 = ['m-1', 'm-2', 'm-3']
const moto = (n: number, bloqueio: string | null = null, saiJunto: SaiJunto = { historico: 1 }, pecasEmOs = 0): Moto =>
  ({ id: `m-${n}`, chassi: `TESTE00REM00000${n}`, modelo: 'X12', loja: 'Loja Teste', nfEntrada: '43440', bloqueio, saiJunto, pecasEmOs, mesmaNf: DA_43440.filter(id => id !== `m-${n}`) })
const VENDIDA = 'Esta moto tem venda. Cancele a venda antes de remover.'
const DA_NF = [moto(1, null, { os: 1, itensDeOs: 2, historico: 3 }, 2), moto(2), moto(3, VENDIDA)]

const api = {
  buscar: mock.fn(async (_termo: string): Promise<Moto[]> => DA_NF),
  remover: mock.fn(async (_ids: string[], _motivo: string, _conf: string): Promise<ResultadoAction<{ removidas: number }>> => ({ ok: true, dados: { removidas: 2 } })),
}
mock.module('../arquivar-actions', { namedExports: {
  buscarMotosParaRemoverAction: (t: string) => api.buscar(t),
  removerMotosAction: (ids: string[], motivo: string, conf: string) => api.remover(ids, motivo, conf),
} })

const montados: (() => Promise<void>)[] = []
afterEach(async () => {
  for (const m of Object.values(api)) m.mock.resetCalls()
  api.buscar.mock.mockImplementation(async () => DA_NF)
  api.remover.mock.mockImplementation(async () => ({ ok: true, dados: { removidas: 2 } }))
  for (const desmontar of montados.splice(0)) await desmontar()
})

async function montar() {
  const { RemoverMotoDialog } = await import('./remover-moto-dialog')
  const onFechar = mock.fn()
  const t = await montarDialogo(RemoverMotoDialog, { aberto: true, onFechar })
  montados.push(t.desmontar)
  const { act, preencher, clique, marcar } = t
  const buscar = async (termo: string) => { await preencher('busca-remover', termo); await clique('Buscar') }
  /** Passo 1 com as 2 motos livres da NF marcadas, até o passo 3 com motivo e confirmação. */
  const ateConfirmar = async (motivo = 'NF importada no grupo errado', confirmacao = 'CONFIRMAR') => {
    await buscar('43440'); await marcar('Marcar todas que podem (2)')
    await clique('Continuar com 2 motos'); await clique('Continuar')
    await preencher('motivo-remocao', motivo)
    await preencher('confirmar-remocao', confirmacao)
  }
  return { act, preencher, clique, marcar, buscar, ateConfirmar, onFechar }
}

test('moto vendida aparece apagada com a frase do servidor e fica fora do "marcar todas que podem"', async () => {
  const t = await montar()
  await t.buscar('43440')
  assert.deepEqual(api.buscar.mock.calls.map(c => c.arguments[0]), ['43440'])
  assert.match(textoDaTela(), new RegExp(VENDIDA))
  assert.ok(caixa('TESTE00REM000003')!.disabled)
  await t.marcar('Marcar todas que podem (2)')
  assert.deepEqual([1, 2, 3].map(n => caixa(`TESTE00REM00000${n}`)!.checked), [true, true, false])
})

test('Conferir mostra, moto por moto, o que sai junto e o aviso das peças; a NF com moto que fica continua lançada', async () => {
  const t = await montar()
  await t.buscar('43440'); await t.marcar('Marcar todas que podem (2)')
  await t.clique('Continuar com 2 motos')
  const texto = textoDaTela()
  for (const linha of ['1 OS', '2 itens de OS', '3 registros do histórico', '1 registro do histórico', 'Não dá para desfazer.',
    '2 itens de peça usados em OS não voltam ao estoque de peças.', 'A NF de entrada 43440 continua lançada em Notas recebidas: outras motos dela ficam no MOVA.']) {
    assert.ok(texto.includes(linha), linha)
  }
  assert.ok(!texto.includes('volta a "pendente"'), 'a 3ª moto da NF fica: a NF não volta')
})

test('Conferir avisa que a NF volta a "pendente" quando todas as motos dela saem', async () => {
  api.buscar.mock.mockImplementation(async () => [{ ...moto(7), nfEntrada: '555', mesmaNf: [] }])
  const t = await montar()
  await t.buscar('555'); await t.marcar('TESTE00REM000007')
  await t.clique('Continuar com 1 moto')
  assert.ok(textoDaTela().includes('A NF de entrada 555 volta a "pendente" em Notas recebidas e pode ser importada de novo.'))
})

test('sem motivo ou sem CONFIRMAR não envia; com os dois envia e termina em "N motos removidas"', async () => {
  const t = await montar()
  await t.ateConfirmar('NF importada no grupo errado', 'confirmar')
  assert.ok(botao('Remover 2 motos')!.disabled, 'CONFIRMAR em minúsculas, como o servidor recusa')
  await t.preencher('confirmar-remocao', 'CONFIRMAR')
  await t.preencher('motivo-remocao', '  ')
  assert.ok(botao('Remover 2 motos')!.disabled, 'motivo em branco')
  await t.preencher('motivo-remocao', 'NF importada no grupo errado')
  await t.clique('Remover 2 motos')
  assert.deepEqual(api.remover.mock.calls.map(c => c.arguments), [[['m-1', 'm-2'], 'NF importada no grupo errado', 'CONFIRMAR']])
  assert.match(textoDaTela(), /2 motos removidas/)
  await t.clique('Fechar')
  assert.equal(t.onFechar.mock.callCount(), 1)
})

test('trava enquanto envia: duplo clique envia uma vez, botões desabilitados e Escape não fecha', async () => {
  let liberar: () => void = () => {}
  api.remover.mock.mockImplementation(() => new Promise(ok => { liberar = () => ok({ ok: true, dados: { removidas: 2 } }) }))
  const t = await montar()
  await t.ateConfirmar()
  await t.act(async () => { clicar(botao('Remover 2 motos')); clicar(botao('Remover 2 motos')); await esperar(20) })
  assert.equal(api.remover.mock.callCount(), 1)
  assert.ok(botao('Removendo...')!.disabled)
  assert.ok(botao('Voltar')!.disabled && botao('Cancelar')!.disabled)
  assert.ok((document.getElementById('confirmar-remocao') as HTMLInputElement).disabled)
  await t.act(async () => { apertarEscape(); await esperar(DEPOIS_DA_ANIMACAO_MS) })
  assert.equal(t.onFechar.mock.callCount(), 0, 'Escape não fecha enquanto envia')
  await t.act(async () => { liberar(); await esperar(20) })
  assert.match(textoDaTela(), /2 motos removidas/)
})

test('recusa do servidor aparece no passo 3 e destrava; sem resposta avisa para conferir antes de tentar de novo', async () => {
  api.remover.mock.mockImplementationOnce(async () => ({ ok: false, erro: `TESTE00REM000001: ${VENDIDA}` }))
  const t = await montar()
  await t.ateConfirmar()
  await t.clique('Remover 2 motos')
  assert.match(textoDaTela(), new RegExp(`TESTE00REM000001: ${VENDIDA}`))
  assert.ok(!botao('Remover 2 motos')!.disabled)
  api.remover.mock.mockImplementationOnce(async () => { throw new Error('rede') })
  await t.clique('Remover 2 motos')
  assert.match(textoDaTela(), /Sem resposta do servidor\. Confira no Showroom se as motos saíram antes de tentar de novo\./)
  assert.equal(t.onFechar.mock.callCount(), 0)
})
