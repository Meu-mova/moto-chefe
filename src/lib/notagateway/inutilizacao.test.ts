import { test } from 'node:test'
import assert from 'node:assert/strict'
import { decidirInutilizacao, serieEUfDaEmpresa, ufPermiteInutilizacao, validarFaixaInutilizacao, elegivelParaInutilizar, ERRO_SEM_CONFIGURACAO, pedidoSemRespostaVenceu, podePedirInutilizacao, type ContextoInutilizacao, situacaoInutilizacao, STATUS_NAO_ENVIADA, STATUS_SEM_CONFIGURACAO, normalizarJustificativa, validarJustificativa } from './inutilizacao'

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

const notaBase = { id: 'n1', ambiente: 'Homologacao', ...negada }
const ctxBase: ContextoInutilizacao = { nota: notaBase, outraNotaVivaDaVenda: null, outrasNotas: [], pedidos: [], ambienteDoGrupo: 'Homologacao' }
const outra = (p: Partial<ContextoInutilizacao['outrasNotas'][number]> = {}) =>
  ({ id: 'n2', numero: '974', serie: '1', status: 'Autorizada', motivoStatus: null, ...p })
const pedido = (p: Partial<ContextoInutilizacao['pedidos'][number]> = {}) =>
  ({ situacao: 'pendente' as const, motivoStatus: null, serie: '1', numeroInicial: 974, numeroFinal: 974, criadoEm: '2026-10-29T12:00:00Z', ...p })
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
    [/continua ativa/, { nota: { ...notaBase, vendaId: 'v1' } }],
    [/rejeitada pela SEFAZ/, { nota: { ...notaBase, status: 'Autorizada' } }],
    [/não tem número/, { nota: { ...notaBase, numero: null } }],
    [/já foi usado na SEFAZ/, { nota: { ...notaBase, motivoStatus: '539 - Duplicidade de NF-e' } }],
    [/já foi usado na SEFAZ/, { nota: { ...notaBase, motivoStatus: '301 - Uso Denegado' } }],
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
  assert.deepEqual(decidirInutilizacao({ ...ctxBase, nota: { ...notaBase, numero: '0974', serie: '001' } }), { tipo: 'pode', serie: '1', numero: 974, ultimaNegada: null })
})

test('decide: grupo em outro ambiente ou sem credencial da NG: sem botão, com a orientação na linha (C1)', () => {
  assert.deepEqual(decidirInutilizacao({ ...ctxBase, ambienteDoGrupo: 'Producao' }), { tipo: 'ambiente_divergente', erro: 'Esta nota é de homologação e o grupo está em produção. Volte o ambiente em Admin, Notas fiscais, para inutilizar o número' })
  assert.deepEqual(decidirInutilizacao({ ...ctxBase, ambienteDoGrupo: null }), { tipo: 'sem_configuracao', erro: ERRO_SEM_CONFIGURACAO })
  // O pedido em andamento continua aparecendo, mesmo com o grupo em outro ambiente.
  assert.equal(decidirInutilizacao({ ...ctxBase, ambienteDoGrupo: 'Producao', pedidos: [pedido()] }).tipo, 'pendente')
})

test('normalizarJustificativa é o que o contador do diálogo mede: sem acento, sem espaço repetido (C3)', () => {
  assert.equal(normalizarJustificativa('  Venda  cancelada após\n a rejeição  '), 'Venda cancelada apos a rejeicao')
  assert.equal(normalizarJustificativa(''), '')
})

const faixa = { serie: '1', numeroInicial: '16', numeroFinal: '24', justificativa: 'Quebra na sequência da numeração' }

test('faixa: aceita crescente, de 1 a 10.000 números, e devolve números e justificativa normalizada', () => {
  assert.deepEqual(validarFaixaInutilizacao(faixa), { ok: true, faixa: { serie: '1', numeroInicial: 16, numeroFinal: 24, justificativa: 'Quebra na sequencia da numeracao' } })
  assert.equal(validarFaixaInutilizacao({ ...faixa, numeroInicial: '16', numeroFinal: '16' }).ok, true)
  assert.equal(validarFaixaInutilizacao({ ...faixa, numeroInicial: '1', numeroFinal: '10000' }).ok, true)
})

test('faixa: recusa decrescente, zero, não inteiro, mais de 10.000 números e série fora de 1 a 999', () => {
  for (const ruim of [
    { numeroInicial: '24', numeroFinal: '16' }, { numeroInicial: '0', numeroFinal: '5' }, { numeroInicial: '1.5', numeroFinal: '5' },
    { numeroInicial: '', numeroFinal: '5' }, { numeroInicial: '1', numeroFinal: '10001' }, { serie: '0' }, { serie: '1000' }, { serie: 'A' },
  ]) assert.equal(validarFaixaInutilizacao({ ...faixa, ...ruim }).ok, false, JSON.stringify(ruim))
})

test('faixa: justificativa curta é recusada pela regra que já existe', () => {
  assert.equal(validarFaixaInutilizacao({ ...faixa, justificativa: 'curta' }).ok, false)
})

test('UF: AC, BA e SP não pedem inutilização (Ajuste SINIEF 40/2026); as outras pedem', () => {
  for (const uf of ['AC', 'BA', 'SP', ' sp ']) assert.equal(ufPermiteInutilizacao(uf), false, uf)
  for (const uf of ['MG', 'RJ', 'PI']) assert.equal(ufPermiteInutilizacao(uf), true, uf)
})

test('empresa da NG: série do ambiente da credencial e UF do endereço', () => {
  const empresa = { endereco: { uf: 'mg' }, emissaoNFeProduto: { ambienteProducao: { serieNFe: '2' }, ambienteHomologacao: { serieNFe: '9' } } }
  assert.deepEqual(serieEUfDaEmpresa(empresa, 'Producao'), { serie: '2', uf: 'MG' })
  assert.deepEqual(serieEUfDaEmpresa(empresa, 'Homologacao'), { serie: '9', uf: 'MG' })
  assert.equal(serieEUfDaEmpresa({ ...empresa, emissaoNFeProduto: {} }, 'Producao'), null, 'sem série no ambiente')
  assert.equal(serieEUfDaEmpresa({ emissaoNFeProduto: empresa.emissaoNFeProduto }, 'Producao'), null, 'sem UF')
  assert.equal(serieEUfDaEmpresa(null, 'Producao'), null)
})

test('decide: faixa pedida que cobre o número esconde o botão; faixa que não cobre ou de outra série não', () => {
  const faixaPedida = (extra = {}) => pedido({ numeroInicial: 970, numeroFinal: 980, ...extra })
  assert.equal(decidirInutilizacao({ ...ctxBase, pedidos: [faixaPedida()] }).tipo, 'pendente')
  assert.equal(decidirInutilizacao({ ...ctxBase, pedidos: [faixaPedida({ situacao: 'autorizada' })] }).tipo, 'autorizada')
  assert.equal(decidirInutilizacao({ ...ctxBase, pedidos: [faixaPedida({ numeroInicial: 975, numeroFinal: 980 })] }).tipo, 'pode')
  assert.equal(decidirInutilizacao({ ...ctxBase, pedidos: [faixaPedida({ serie: '2' })] }).tipo, 'pode')
})
