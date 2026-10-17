import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { STATUS_MORTOS, cancelamentoConcluido, deveDesfazerFaturamento, efeitoNaVenda, ehFinal, ehRecusada, limiteCancelamento, motivoDoStatus, podeDescartarTentativa, podeCancelarExtemporaneo, normalizarContador, situacaoCancelamento, travaDoCancelamentoDaVenda } from './status'

// Os status não finais da doc "Status da nota fiscal" da Nota Gateway.
const INTERMEDIARIOS = [
  'AguardandoAutorizacao', 'SolicitandoAutorizacao', 'AutorizacaoSolicitada',
  'EmProcessoDeAutorizacao', 'AutorizadaAguardandoGeracaoPDF',
  'SolicitandoCancelamento', 'CancelamentoSolicitado', 'EmProcessoDeCancelamento',
  'CanceladaAguardandoAtualizacaoPDF',
]

test('nenhum status intermediário da API está na lista que libera nova emissão', () => {
  for (const status of INTERMEDIARIOS) assert.equal(STATUS_MORTOS.includes(status), false, status)
})

test('Autorizada, CancelamentoNegado e os nossos status de envio não estão na lista que libera nova emissão', () => {
  for (const status of ['Autorizada', 'CancelamentoNegado', 'Enviando', 'Processando']) {
    assert.equal(STATUS_MORTOS.includes(status), false, status)
  }
})

test('Negada, Denegada, Cancelada e Descartada estão na lista que libera nova emissão', () => {
  for (const status of ['Negada', 'Denegada', 'Cancelada', 'Descartada']) assert.equal(STATUS_MORTOS.includes(status), true, status)
})

test('Autorizada, Negada, Denegada, Cancelada, Descartada e CancelamentoNegado são finais', () => {
  for (const status of ['Autorizada', 'Negada', 'Denegada', 'Cancelada', 'Descartada', 'CancelamentoNegado']) {
    assert.equal(ehFinal(status), true, status)
  }
})

test('status intermediários, os nossos status de envio e um status novo da API não são finais', () => {
  for (const status of [...INTERMEDIARIOS, 'Enviando', 'Processando', 'StatusNovoDaApi']) {
    assert.equal(ehFinal(status), false, status)
  }
})

test('só Negada e Denegada contam como recusa da SEFAZ', () => {
  for (const status of ['Negada', 'Denegada']) assert.equal(ehRecusada(status), true, status)
  for (const status of ['Autorizada', 'Cancelada', 'CancelamentoNegado', 'EmProcessoDeAutorizacao', 'Enviando']) {
    assert.equal(ehRecusada(status), false, status)
  }
})

test('o índice da trava, na migração mais recente que o cria, libera os mesmos status que o código', () => {
  const pasta = resolve(process.cwd(), 'src/lib/db/migrations')
  const ultima = readdirSync(pasta)
    .filter(nome => nome.endsWith('.sql'))
    .sort()
    .map(nome => readFileSync(resolve(pasta, nome), 'utf8'))
    .filter(sql => /CREATE UNIQUE INDEX (IF NOT EXISTS )?notas_fiscais_saida_uma_viva_idx/.test(sql))
    .at(-1)
  const lista = ultima?.match(/status NOT IN \(([^)]*)\)/)?.[1]
  assert.ok(lista, 'a migração mais recente do índice precisa ter o "status NOT IN (...)" da trava')
  const doBanco = [...lista.matchAll(/'([^']+)'/g)].map(m => m[1]).sort()
  assert.deepEqual(doBanco, [...STATUS_MORTOS].sort())
})

const AUTORIZADA_EM = '2026-10-08T15:40:00.000Z'

test('nota autorizada há menos de 24h pode ser cancelada', () => {
  const nota = { status: 'Autorizada', dataAutorizacao: AUTORIZADA_EM }
  assert.equal(situacaoCancelamento(nota, new Date('2026-10-08T15:41:00.000Z')), 'disponivel')
  assert.equal(situacaoCancelamento(nota, new Date('2026-10-09T15:39:59.000Z')), 'disponivel')
})

test('com 24h ou mais desde a autorização, passou do prazo de cancelar', () => {
  const nota = { status: 'Autorizada', dataAutorizacao: AUTORIZADA_EM }
  assert.equal(situacaoCancelamento(nota, new Date('2026-10-09T15:40:00.000Z')), 'fora_do_prazo')
  assert.equal(situacaoCancelamento(nota, new Date('2026-10-10T09:00:00.000Z')), 'fora_do_prazo')
})

test('depois de cancelamento negado, dá para pedir de novo dentro do prazo', () => {
  const nota = { status: 'CancelamentoNegado', dataAutorizacao: AUTORIZADA_EM }
  assert.equal(situacaoCancelamento(nota, new Date('2026-10-09T10:00:00.000Z')), 'disponivel')
  assert.equal(situacaoCancelamento(nota, new Date('2026-10-09T16:00:00.000Z')), 'fora_do_prazo')
})

test('nota com cancelamento já pedido fica em andamento até a SEFAZ responder', () => {
  const agora = new Date('2026-10-08T16:00:00.000Z')
  for (const status of ['SolicitandoCancelamento', 'CancelamentoSolicitado', 'EmProcessoDeCancelamento', 'CanceladaAguardandoAtualizacaoPDF']) {
    assert.equal(situacaoCancelamento({ status, dataAutorizacao: AUTORIZADA_EM }, agora), 'em_andamento', status)
  }
})

test('nota negada, já cancelada ou ainda em emissão não tem cancelamento', () => {
  const agora = new Date('2026-10-08T16:00:00.000Z')
  for (const status of ['Negada', 'Denegada', 'Cancelada', 'EmProcessoDeAutorizacao', 'Enviando']) {
    assert.equal(situacaoCancelamento({ status, dataAutorizacao: null }, agora), 'indisponivel', status)
  }
})

test('nota autorizada sem a data de autorização gravada não tem prazo calculável', () => {
  assert.equal(situacaoCancelamento({ status: 'Autorizada', dataAutorizacao: null }, new Date()), 'sem_data')
})

const PEDIDO_EM = new Date('2026-10-09T15:00:00Z')

test('pedido sobre nota autorizada: Cancelada e CancelamentoNegado encerram a espera; Autorizada e status intermediários, não', () => {
  const pedido = { statusAntes: 'Autorizada', em: PEDIDO_EM }
  for (const status of ['Cancelada', 'CancelamentoNegado']) {
    assert.equal(cancelamentoConcluido({ status, dataUltimaAlteracao: null }, pedido), true, status)
  }
  for (const status of ['Autorizada', 'SolicitandoCancelamento', 'EmProcessoDeCancelamento', 'CanceladaAguardandoAtualizacaoPDF']) {
    assert.equal(cancelamentoConcluido({ status, dataUltimaAlteracao: null }, pedido), false, status)
  }
})

test('pedido de novo sobre CancelamentoNegado: a recusa só encerra a espera se a última alteração for depois do pedido', () => {
  const pedido = { statusAntes: 'CancelamentoNegado', em: PEDIDO_EM }
  assert.equal(cancelamentoConcluido({ status: 'CancelamentoNegado', dataUltimaAlteracao: '2026-10-09T15:00:03Z' }, pedido), true)
  assert.equal(cancelamentoConcluido({ status: 'CancelamentoNegado', dataUltimaAlteracao: '2026-10-09T14:58:00Z' }, pedido), false)
  assert.equal(cancelamentoConcluido({ status: 'CancelamentoNegado', dataUltimaAlteracao: null }, pedido), false)
  assert.equal(cancelamentoConcluido({ status: 'Cancelada', dataUltimaAlteracao: null }, pedido), true)
})

test('nota de produção cancelada com data de autorização é caso de desfazer o faturamento', () => {
  assert.equal(deveDesfazerFaturamento({ status: 'Cancelada', ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM }), true)
})

test('cancelamento lógico de nota negada, nota de homologação e cancelamento não concluído não são caso de desfazer o faturamento', () => {
  assert.equal(deveDesfazerFaturamento({ status: 'Cancelada', ambiente: 'Producao', dataAutorizacao: null }), false)
  assert.equal(deveDesfazerFaturamento({ status: 'Cancelada', ambiente: 'Homologacao', dataAutorizacao: AUTORIZADA_EM }), false)
  for (const status of ['CancelamentoNegado', 'EmProcessoDeCancelamento', 'Autorizada']) {
    assert.equal(deveDesfazerFaturamento({ status, ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM }), false, status)
  }
})

test('o limite para cancelar é 24h depois da autorização', () => {
  assert.equal(limiteCancelamento(AUTORIZADA_EM).toISOString(), '2026-10-09T15:40:00.000Z')
})

test('na nota cancelada ou com cancelamento negado, o statusSefaz "100 - Autorizado o uso da NF-e" não vira motivo', () => {
  for (const status of ['Cancelada', 'CancelamentoNegado']) {
    assert.equal(motivoDoStatus({ status, motivoStatus: null, statusSefaz: '100 - Autorizado o uso da NF-e' }), null, status)
  }
})

test('na nota recusada sem motivoStatus, o motivo é o statusSefaz', () => {
  assert.equal(motivoDoStatus({ status: 'Negada', motivoStatus: null, statusSefaz: '778 - Rejeição: NCM inexistente' }), '778 - Rejeição: NCM inexistente')
})

test('o motivoStatus da API vence o statusSefaz', () => {
  assert.equal(motivoDoStatus({ status: 'Negada', motivoStatus: '778 - Rejeição: NCM inexistente', statusSefaz: '225 - Rejeição: Falha no Schema XML' }), '778 - Rejeição: NCM inexistente')
})

test('nota de produção que acaba de ser autorizada fatura a venda; a que acaba de ser cancelada desfaz', () => {
  assert.equal(efeitoNaVenda('Processando', { status: 'Autorizada', ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM }), 'faturar')
  assert.equal(efeitoNaVenda('EmProcessoDeCancelamento', { status: 'Cancelada', ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM }), 'desfazer')
})

test('nota que já estava autorizada ou cancelada não mexe de novo na venda', () => {
  assert.equal(efeitoNaVenda('Autorizada', { status: 'Autorizada', ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM }), null)
  assert.equal(efeitoNaVenda('Cancelada', { status: 'Cancelada', ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM }), null)
})

test('nota de homologação e cancelamento lógico de nota negada não mexem na venda', () => {
  assert.equal(efeitoNaVenda('Processando', { status: 'Autorizada', ambiente: 'Homologacao', dataAutorizacao: AUTORIZADA_EM }), null)
  assert.equal(efeitoNaVenda('Negada', { status: 'Cancelada', ambiente: 'Producao', dataAutorizacao: null }), null)
})

const DENTRO_DO_PRAZO = new Date('2026-10-08T16:00:00.000Z')
const FORA_DO_PRAZO = new Date('2026-10-09T16:00:00.000Z')
const notaDaVenda = (status: string, extra: { ambiente?: string; dataAutorizacao?: string | null; numero?: string } = {}) =>
  ({ ambiente: 'Producao', status, dataAutorizacao: AUTORIZADA_EM, numero: '4512', ...extra })

test('venda sem nota de produção viva do MOVA pode ser cancelada', () => {
  assert.equal(travaDoCancelamentoDaVenda([], DENTRO_DO_PRAZO), null)
  assert.equal(travaDoCancelamentoDaVenda([notaDaVenda('Negada'), notaDaVenda('Cancelada')], DENTRO_DO_PRAZO), null)
})

test('nota de homologação não trava o cancelamento da venda', () => {
  assert.equal(travaDoCancelamentoDaVenda([notaDaVenda('Autorizada', { ambiente: 'Homologacao' })], DENTRO_DO_PRAZO), null)
})

test('nota de produção em emissão, ou num status novo da API, trava como emissão em andamento', () => {
  for (const status of ['Enviando', 'Processando', 'EmProcessoDeAutorizacao', 'AutorizadaAguardandoGeracaoPDF', 'StatusQueAApiAindaNaoTem']) {
    assert.equal(travaDoCancelamentoDaVenda([notaDaVenda(status, { dataAutorizacao: null })], DENTRO_DO_PRAZO)?.trava, 'emissao_em_andamento', status)
  }
})

test('nota autorizada no prazo trava como cancelar a NF, e a trava aponta a nota viva', () => {
  const r = travaDoCancelamentoDaVenda([notaDaVenda('Cancelada', { numero: '4511' }), notaDaVenda('Autorizada')], DENTRO_DO_PRAZO)
  assert.equal(r?.trava, 'cancelar_nf')
  assert.equal(r?.nota.numero, '4512')
})

test('cancelamento em andamento trava como cancelamento em andamento', () => {
  assert.equal(travaDoCancelamentoDaVenda([notaDaVenda('EmProcessoDeCancelamento')], DENTRO_DO_PRAZO)?.trava, 'cancelamento_em_andamento')
})

test('cancelamento recusado no prazo trava como tentar de novo', () => {
  assert.equal(travaDoCancelamentoDaVenda([notaDaVenda('CancelamentoNegado')], DENTRO_DO_PRAZO)?.trava, 'tentar_de_novo')
})

test('fora do prazo, nota autorizada ou com cancelamento recusado trava como fora do prazo', () => {
  for (const status of ['Autorizada', 'CancelamentoNegado']) {
    assert.equal(travaDoCancelamentoDaVenda([notaDaVenda(status)], FORA_DO_PRAZO)?.trava, 'fora_do_prazo', status)
  }
})

test('nota autorizada sem data de autorização trava como sem data', () => {
  assert.equal(travaDoCancelamentoDaVenda([notaDaVenda('Autorizada', { dataAutorizacao: null })], DENTRO_DO_PRAZO)?.trava, 'sem_data')
})

const AGORA = new Date('2026-10-09T18:00:00.000Z')
const criadaHa = (minutos: number) => new Date(AGORA.getTime() - minutos * 60 * 1000).toISOString()

test('tentativa parada em Enviando há 15 minutos ou mais pode ser descartada', () => {
  assert.equal(podeDescartarTentativa({ status: 'Enviando', criadoEm: criadaHa(15) }, AGORA), true)
  assert.equal(podeDescartarTentativa({ status: 'Enviando', criadoEm: criadaHa(90) }, AGORA), true)
})

test('tentativa em Enviando há menos de 15 minutos ainda não pode ser descartada', () => {
  assert.equal(podeDescartarTentativa({ status: 'Enviando', criadoEm: criadaHa(14) }, AGORA), false)
})

test('Processando, EmProcessoDeAutorizacao, Autorizada, Negada e Descartada não podem ser descartadas', () => {
  for (const status of ['Processando', 'EmProcessoDeAutorizacao', 'Autorizada', 'Negada', 'Descartada']) {
    assert.equal(podeDescartarTentativa({ status, criadoEm: criadaHa(90) }, AGORA), false, status)
  }
})

const VENCIDO = new Date('2026-10-09T15:40:00.000Z')

test('nota de produção autorizada ou com cancelamento negado, depois das 24h, aceita cancelamento extemporâneo', () => {
  for (const status of ['Autorizada', 'CancelamentoNegado']) {
    assert.equal(podeCancelarExtemporaneo({ status, ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM }, VENCIDO), true, status)
  }
})

test('nota no prazo, de homologação, sem data, já cancelada ou com cancelamento em andamento não aceita cancelamento extemporâneo', () => {
  const casos = [
    { status: 'Autorizada', ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM, agora: new Date('2026-10-09T15:39:59.000Z') },
    { status: 'Autorizada', ambiente: 'Homologacao', dataAutorizacao: AUTORIZADA_EM, agora: VENCIDO },
    { status: 'Autorizada', ambiente: 'Producao', dataAutorizacao: null, agora: VENCIDO },
    { status: 'Cancelada', ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM, agora: VENCIDO },
    { status: 'EmProcessoDeCancelamento', ambiente: 'Producao', dataAutorizacao: AUTORIZADA_EM, agora: VENCIDO },
  ]
  for (const { agora, ...nota } of casos) {
    assert.equal(podeCancelarExtemporaneo(nota, agora), false, JSON.stringify(nota))
  }
})

test('o contador é guardado como foi digitado, sem os espaços das pontas', () => {
  assert.deepEqual(normalizarContador('  Pablo / Contábil X '), { ok: true, contador: 'Pablo / Contábil X' })
})

test('contador vazio é recusado', () => {
  for (const bruto of ['', '   ']) {
    assert.equal(normalizarContador(bruto).ok, false, JSON.stringify(bruto))
  }
})
