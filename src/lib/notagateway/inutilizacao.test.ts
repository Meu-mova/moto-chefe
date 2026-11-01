import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirInutilizacao, elegivelParaInutilizar, pedidoSemRespostaVenceu, podePedirInutilizacao, type ContextoInutilizacao, situacaoInutilizacao, STATUS_NAO_ENVIADA, STATUS_SEM_CONFIGURACAO, validarJustificativa } from './inutilizacao'

test('justificativa: tira acentos e espaços sobrando', () => {
  assert.deepEqual(validarJustificativa('  Venda cancelada após\n a rejeição  '), { ok: true, justificativa: 'Venda cancelada apos a rejeicao' })
})

test('justificativa: aceita de 15 a 255 caracteres', () => {
  assert.equal(validarJustificativa('a'.repeat(15)).ok, true)
  assert.equal(validarJustificativa('a'.repeat(255)).ok, true)
  assert.equal(validarJustificativa('a'.repeat(14)).ok, false)
  assert.equal(validarJustificativa('a'.repeat(256)).ok, false)
})

test('justificativa: recusa caractere fora do ASCII básico que não é acento', () => {
  assert.equal(validarJustificativa('Venda cancelada — sem reenvio').ok, false)
})

test('situação: lê os status finais da API; o resto está em andamento', () => {
  assert.equal(situacaoInutilizacao('InutilizacaoAutorizada'), 'autorizada')
  assert.equal(situacaoInutilizacao('InutilizacaoNegada'), 'negada')
  // Nomes que a consulta da homologação devolveu de fato.
  assert.equal(situacaoInutilizacao('Autorizada'), 'autorizada')
  assert.equal(situacaoInutilizacao('Negada'), 'negada')
  assert.equal(situacaoInutilizacao('Processando'), 'pendente')
  assert.equal(situacaoInutilizacao('Enviando'), 'pendente')
})

const negada = { status: 'Negada', motivoStatus: '225 - Falha no schema', numero: '974', serie: '1', vendaId: null }

test('elegível: rejeitada de venda cancelada, com número e série', () => {
  assert.deepEqual(elegivelParaInutilizar(negada, null), { ok: true, serie: '1', numero: 974 })
  // A série vai sem zeros à esquerda: "001" e "1" são a mesma série na SEFAZ.
  assert.deepEqual(elegivelParaInutilizar({ ...negada, serie: '001', numero: '0974' }, null), { ok: true, serie: '1', numero: 974 })
})

test('elegível: rejeitada de venda ativa que já saiu em outra nota, com outro número', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, vendaId: 'v1' }, { numero: '975' }).ok, true)
})

test('não elegível: rejeitada de venda ativa, que ainda vai ser reenviada', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, vendaId: 'v1' }, null).ok, false)
  assert.equal(elegivelParaInutilizar({ ...negada, vendaId: 'v1' }, { numero: '974' }).ok, false)
  assert.equal(elegivelParaInutilizar({ ...negada, vendaId: 'v1' }, { numero: '0974' }).ok, false)
})

test('não elegível: sem número ou série gravados', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, numero: null }, null).ok, false)
  assert.equal(elegivelParaInutilizar({ ...negada, serie: null }, null).ok, false)
})

test('não elegível: denegada, que chega como "Negada" e já usou o número', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, motivoStatus: '301 - Uso Denegado: irregularidade fiscal do emitente' }, null).ok, false)
  assert.equal(elegivelParaInutilizar({ ...negada, motivoStatus: '302: Uso Denegado' }, null).ok, false)
  // O status literal "Denegada" é recusa pelo status.ts: a frase é a do número já usado, não "só rejeitada".
  assert.deepEqual(elegivelParaInutilizar({ ...negada, status: 'Denegada', motivoStatus: null }, null), { ok: false, erro: 'O número desta nota já foi usado na SEFAZ e não pode ser inutilizado.' })
})

test('não elegível: 539, número já usado em outra nota na SEFAZ', () => {
  assert.equal(elegivelParaInutilizar({ ...negada, motivoStatus: '539 - Duplicidade de NF-e' }, null).ok, false)
})

test('não elegível: descartada, autorizada, cancelada ou em andamento', () => {
  for (const status of ['Descartada', 'Denegada', 'Autorizada', 'Cancelada', 'Processando', 'Enviando']) {
    assert.equal(elegivelParaInutilizar({ ...negada, status }, null).ok, false, status)
  }
})

test('situação: pedido não enviado e sem configuração contam como negada, que libera o número', () => {
  assert.equal(situacaoInutilizacao(STATUS_NAO_ENVIADA), 'negada')
  assert.equal(situacaoInutilizacao(STATUS_SEM_CONFIGURACAO), 'negada')
})

test('pedido que a NG não conhece só vence depois de 15 minutos', () => {
  const criado = new Date('2026-10-29T12:00:00Z')
  assert.equal(pedidoSemRespostaVenceu(criado, new Date('2026-10-29T12:14:59Z')), false)
  assert.equal(pedidoSemRespostaVenceu(criado, new Date('2026-10-29T12:15:00Z')), true)
})

test('quem pede a inutilização: admin_geral, admin_socio e admin_rede (decisões do Luis, #504 e #597)', () => {
  for (const papel of ['admin_geral', 'admin_socio', 'admin_rede']) assert.equal(podePedirInutilizacao(papel), true, papel)
  for (const papel of ['aux_adm', 'vendedor', 'mecanico', 'motorista', 'cargo', '']) {
    assert.equal(podePedirInutilizacao(papel), false, papel || '(vazio)')
  }
})

const ctxBase: ContextoInutilizacao = { nota: { id: 'n1', ...negada }, outraNotaVivaDaVenda: null, outrasNotas: [], pedidos: [] }
const outra = (p: Partial<ContextoInutilizacao['outrasNotas'][number]> = {}) =>
  ({ id: 'n2', numero: '974', serie: '1', status: 'Autorizada', motivoStatus: null, ...p })
const pedido = (p: Partial<ContextoInutilizacao['pedidos'][number]> = {}) =>
  ({ situacao: 'pendente' as const, motivoStatus: null, serie: '1', numeroInicial: 974, criadoEm: '2026-10-29T12:00:00Z', ...p })
const erroDe = (d: ReturnType<typeof decidirInutilizacao>) => (d as { erro: string }).erro

test('decide: recusada elegível, sem pedido e sem outra nota com o número, pode ser inutilizada', () => {
  assert.deepEqual(decidirInutilizacao(ctxBase), { tipo: 'pode', serie: '1', numero: 974, ultimaNegada: null })
})

test('decide: pedido pendente ou autorizado do número esconde o botão (C5)', () => {
  assert.equal(decidirInutilizacao({ ...ctxBase, pedidos: [pedido()] }).tipo, 'pendente')
  assert.equal(decidirInutilizacao({ ...ctxBase, pedidos: [pedido({ serie: '2' })] }).tipo, 'pode', 'mesmo número em outra série é outra nota')
  assert.equal(decidirInutilizacao({ ...ctxBase, pedidos: [pedido({ situacao: 'autorizada' })] }).tipo, 'autorizada')
  // Com o pedido em andamento, é ele que a linha diz, mesmo que outra nota ocupe o número.
  assert.equal(decidirInutilizacao({ ...ctxBase, pedidos: [pedido()], outrasNotas: [outra()] }).tipo, 'pendente')
})

test('decide: a última negada mostra o motivo e deixa pedir de novo', () => {
  const d = decidirInutilizacao({ ...ctxBase, pedidos: [
    pedido({ situacao: 'negada', motivoStatus: 'Faixa ja utilizada', criadoEm: '2026-10-29T12:00:00Z' }),
    pedido({ situacao: 'negada', motivoStatus: 'Sem configuracao', criadoEm: '2026-10-28T12:00:00Z' }),
  ] })
  assert.deepEqual(d, { tipo: 'pode', serie: '1', numero: 974, ultimaNegada: 'Faixa ja utilizada' })
  const semMotivo = decidirInutilizacao({ ...ctxBase, pedidos: [pedido({ situacao: 'negada', motivoStatus: '  ' })] })
  assert.equal((semMotivo as { ultimaNegada: string }).ultimaNegada, 'sem motivo informado')
})

test('decide: outra nota do grupo que ocupa o número recusa (C4); recusada, descartada, outro número ou outra série não', () => {
  for (const o of [outra(), outra({ status: 'Cancelada' }), outra({ status: 'CancelamentoNegado' }), outra({ status: 'Processando' }), outra({ status: 'Negada', motivoStatus: '302 - Uso Denegado' })]) {
    const d = decidirInutilizacao({ ...ctxBase, outrasNotas: [o] })
    assert.equal(d.tipo, 'numero_usado', o.status)
    assert.match(erroDe(d), /974 está em outra nota/)
  }
  for (const o of [outra({ status: 'Negada', motivoStatus: '225 - Falha no schema' }), outra({ status: 'Descartada' }), outra({ numero: '975' }), outra({ serie: '2' }), outra({ id: 'n1' })]) {
    assert.equal(decidirInutilizacao({ ...ctxBase, outrasNotas: [o] }).tipo, 'pode', `${o.id} ${o.status} ${o.numero}/${o.serie}`)
  }
})

test('decide: nota não elegível não mostra nada, e o servidor recebe o motivo', () => {
  const casos: [RegExp, Partial<ContextoInutilizacao>][] = [
    [/continua ativa/, { nota: { id: 'n1', ...negada, vendaId: 'v1' } }],
    [/rejeitada pela SEFAZ/, { nota: { id: 'n1', ...negada, status: 'Autorizada' } }],
    [/não tem número/, { nota: { id: 'n1', ...negada, numero: null } }],
    [/já foi usado na SEFAZ/, { nota: { id: 'n1', ...negada, motivoStatus: '539 - Duplicidade de NF-e' } }],
    [/já foi usado na SEFAZ/, { nota: { id: 'n1', ...negada, motivoStatus: '301 - Uso Denegado' } }],
  ]
  for (const [motivo, parte] of casos) {
    const d = decidirInutilizacao({ ...ctxBase, ...parte })
    assert.equal(d.tipo, 'nenhuma', String(motivo))
    assert.match(erroDe(d), motivo)
  }
})

test('decide: "0974" série "001" é o mesmo número e série que "974" série "1" (C4)', () => {
  assert.equal(decidirInutilizacao({ ...ctxBase, outrasNotas: [outra({ numero: '0974', serie: '001' })] }).tipo, 'numero_usado')
  assert.equal(decidirInutilizacao({ ...ctxBase, pedidos: [pedido({ serie: '001' })] }).tipo, 'pendente')
  assert.deepEqual(decidirInutilizacao({ ...ctxBase, nota: { id: 'n1', ...negada, numero: '0974', serie: '001' } }), { tipo: 'pode', serie: '1', numero: 974, ultimaNegada: null })
})
