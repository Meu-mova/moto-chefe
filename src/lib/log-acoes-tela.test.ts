import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorPessoa, contaDoFiltro, dispositivoLegivel, ehSensivel, resumoDoEvento, ROTULO_TIPO, type EventoLog } from './log-acoes-tela'

const ev = (p: Partial<EventoLog>): EventoLog => ({
  id: 'x', tipo: 'login', usuarioId: 'u1', usuarioNome: 'Ana', contaDoUsuario: 'c1', contaId: 'c1', grupoNome: 'Sul',
  ip: '1.1.1.1', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Version/18.0 Mobile Safari/604.1',
  dia: '2026-10-20', criadoEm: new Date('2026-10-20T12:00:00Z'), detalhe: null, ...p,
})

test('dispositivo legível a partir do user agent', () => {
  assert.equal(dispositivoLegivel(ev({}).userAgent), 'iPhone · Safari')
  assert.equal(dispositivoLegivel('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/141.0 Safari/537.36'), 'Windows · Chrome')
  assert.equal(dispositivoLegivel('Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/141.0 Mobile Safari/537.36'), 'Android · Chrome')
  assert.equal(dispositivoLegivel(null), 'Dispositivo desconhecido')
})

test('uma linha por pessoa, a de acesso mais recente primeiro, com o resumo', () => {
  const grupos = agruparPorPessoa([
    ev({ id: '1', criadoEm: new Date('2026-10-20T12:00:00Z') }),
    ev({ id: '2', tipo: 'venda_cancelada', dia: '2026-10-19', criadoEm: new Date('2026-10-19T12:00:00Z'), userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/141.0' }),
    ev({ id: '3', usuarioId: 'u2', usuarioNome: 'Luis', contaDoUsuario: null, criadoEm: new Date('2026-10-21T12:00:00Z') }),
  ])
  assert.deepEqual(grupos.map(g => g.nome), ['Luis', 'Ana'])
  const ana = grupos[1]
  assert.equal(ana.dias, 2)
  assert.equal(ana.dispositivos, 2)
  assert.equal(ana.sensiveis, 1)
  assert.equal(ana.deFora, false)
  assert.equal(grupos[0].deFora, true, 'sem Conta, entrando num grupo de Conta: é de fora')
})

test('usuário excluído aparece com nome próprio', () => {
  const [excluido] = agruparPorPessoa([ev({ usuarioNome: null, contaDoUsuario: null })])
  assert.equal(excluido.nome, 'Usuário excluído')
  assert.equal(excluido.deFora, false, 'sem a Conta dele, não acusa de fora')
})

test('resumo de cada ação sensível', () => {
  assert.equal(resumoDoEvento(ev({ tipo: 'venda_cancelada', detalhe: { numeroVenda: 30035, cliente: 'Fulano', valor: '7990.00', motivo: 'desistiu' } })), 'Venda #30035 · Fulano · R$ 7.990,00 · “desistiu”')
  assert.equal(resumoDoEvento(ev({ tipo: 'nf_emitida', detalhe: { origem: 'mova', numeroNf: '415', numeroVenda: 30041, ambiente: 'Homologacao', status: 'Autorizada' } })), 'NF 415 da venda #30041 · Autorizada · homologação')
  assert.equal(resumoDoEvento(ev({ tipo: 'nf_cancelada', detalhe: { numeroNf: '415', motivo: 'erro', extemporaneo: true, ambiente: 'Producao' } })), 'NF 415 · “erro” · extemporâneo')
  assert.equal(resumoDoEvento(ev({ tipo: 'permissao_alterada', detalhe: { alvoNome: 'Bruno', acao: 'alterado', campos: ['papel'], papelAntes: 'vendedor', papel: 'aux_adm' } })), 'Bruno · alterado: função (Vendedor → Aux. Administrativo)')
  assert.equal(resumoDoEvento(ev({ tipo: 'permissao_alterada', detalhe: { alvoNome: 'Marina', acao: 'alterado', campos: ['papel', 'cargoId'], papelAntes: 'vendedor', papel: 'cargo', cargo: 'Gerente' } })),
    'Marina · alterado: função, cargo (Vendedor → cargo Gerente)', 'atribuir cargo diz qual')
  assert.equal(resumoDoEvento(ev({ tipo: 'permissao_alterada', detalhe: { alvoNome: 'Marina', acao: 'alterado', campos: ['cargoId'], cargoAntes: 'Gerente', cargo: 'Caixa' } })),
    'Marina · alterado: cargo (cargo Gerente → cargo Caixa)', 'trocar de cargo, com o papel igual')
  assert.equal(resumoDoEvento(ev({ tipo: 'permissao_alterada', detalhe: { alvoNome: 'Marina', acao: 'criado', papel: 'cargo', cargo: 'Gerente' } })),
    'Marina · criado (cargo Gerente)', 'usuário criado já com cargo diz qual')
  assert.equal(resumoDoEvento(ev({ tipo: 'permissao_alterada', detalhe: { alvoNome: 'Bruno', acao: 'criado', papel: 'vendedor' } })), 'Bruno · criado', 'sem cargo, como sempre')
  assert.equal(resumoDoEvento(ev({ tipo: 'troca_grupo', detalhe: { de: 'g1' } })), 'Entrou em Sul')
  assert.equal(resumoDoEvento(ev({ tipo: 'permissao_alterada', detalhe: { alvoNome: 'Bruno', acao: 'alterado', campos: ['lojaId'] } })), 'Bruno · alterado: loja', 'sem mudança de papel, sem (→)')
  assert.equal(resumoDoEvento(ev({ tipo: 'nf_emitida', detalhe: { numeroVenda: 30041, origem: 'mova' } })), 'NF da venda #30041')
  assert.equal(resumoDoEvento(ev({ tipo: 'notas_enviadas_contador', detalhe: { para: 'contador@x.com', de: '2026-10-01', ate: '2026-10-31', notas: 12, modo: 'link' } })),
    'contador@x.com · 01/10/2026 a 31/10/2026 · 12 notas · por link')
  assert.equal(resumoDoEvento(ev({ tipo: 'venda_cancelada', detalhe: {} })), 'Venda #? · ? · ? · “?”', 'linha sem os campos não mostra undefined')
})

test('mudança de permissão usa o texto da tela de usuários, não o nome do campo (#620)', () => {
  const resumo = (detalhe: Record<string, unknown>) => resumoDoEvento(ev({ tipo: 'permissao_alterada', detalhe: { alvoNome: 'Marina', ...detalhe } }))
  assert.equal(resumo({ acao: 'alterado', campos: ['gruposAcesso', 'gruposAprovacao', 'aprovaPagamentoSensivel', 'modulosExtras', 'modulosBloqueados'] }),
    'Marina · alterado: empresas que enxerga, aprova venda em, aprova transferência bancária, módulos liberados a mais, módulos bloqueados')
  assert.equal(resumo({ acao: 'alterado', campos: ['cargoId'] }), 'Marina · alterado: cargo')
  assert.equal(resumo({ acao: 'excluido' }), 'Marina · excluído')
  assert.equal(resumo({ acao: 'grupo_liberado' }), 'Marina · grupo de outra Conta liberado')
  assert.equal(resumo({ acao: 'grupo_revogado' }), 'Marina · grupo de outra Conta revogado')
  assert.equal(resumo({ acao: 'criado' }), 'Marina · criado')
  assert.equal(resumo({ acao: 'alterado', campos: ['campoNovo'] }), 'Marina · alterado: campoNovo', 'campo fora do mapa aparece pelo nome')
})

test('admin da Conta só vê a própria; admin_geral escolhe (ou vê todas)', () => {
  assert.deepEqual(contaDoFiltro({ papel: 'admin_socio', contaId: 'c1' }, 'c2'), { contaId: 'c1' })
  assert.deepEqual(contaDoFiltro({ papel: 'admin_socio', contaId: null }, undefined), null)
  assert.deepEqual(contaDoFiltro({ papel: 'admin_geral', contaId: null }, 'c2'), { contaId: 'c2' })
  assert.deepEqual(contaDoFiltro({ papel: 'admin_geral', contaId: null }, ''), { contaId: 'todas' })
})

test('envio da logo do DANFE mostra o grupo e o tamanho', () => {
  assert.equal(resumoDoEvento(ev({ tipo: 'logo_danfe_enviada', grupoNome: 'Cuiabá', detalhe: { kb: 9 } })), 'Cuiabá · 9 KB')
})

test('correção do preço de compra mostra chassi e os dois valores (#514)', () => {
  const resumo = resumoDoEvento(ev({ tipo: 'preco_compra_alterado', detalhe: { motoId: 'm1', chassi: 'ABC123', de: '6400.00', para: '2016.38' } }))
  assert.equal(resumo.replace(/\u00a0/g, ' '), 'ABC123 · R$ 6.400,00 → R$ 2.016,38')
})

test('transferência entre grupos: Conta e se ligou ou desligou (#552)', () => {
  assert.equal(resumoDoEvento(ev({ tipo: 'transferencia_grupos_alterada', detalhe: { contaId: 'c1', contaNome: 'Conta X', de: false, para: true } })), 'Conta X · ligou')
  assert.equal(resumoDoEvento(ev({ tipo: 'transferencia_grupos_alterada', detalhe: { contaId: 'c1', contaNome: 'Conta X', de: true, para: false } })), 'Conta X · desligou')
})

test('resumo do pedido de inutilização: número, série, venda, resultado e motivo (#597)', () => {
  const detalhe = { origem: 'mova', etapa: 'inutilizacao', numero: 974, serie: '1', numeroVenda: 31601, ambiente: 'Homologacao' }
  const evento = (p: Record<string, unknown>) => ev({ tipo: 'nf_emitida', detalhe: { ...detalhe, ...p } })
  assert.equal(resumoDoEvento(evento({ resultado: 'enviado' })), 'Inutilização do nº 974 série 1 da venda #31601 · pedida · homologação')
  assert.equal(resumoDoEvento(evento({ resultado: 'recusado', motivo: 'Faixa ja utilizada', ambiente: 'Producao' })), 'Inutilização do nº 974 série 1 da venda #31601 · recusada · “Faixa ja utilizada”')
  assert.equal(resumoDoEvento(evento({ resultado: 'sem_resposta', ambiente: 'Producao' })), 'Inutilização do nº 974 série 1 da venda #31601 · pedida sem resposta da Nota Gateway')
  // Linha da v1.15.0: só era gravada depois do envio aceito, sem `resultado`.
  assert.equal(resumoDoEvento(evento({ ambiente: 'Producao' })), 'Inutilização do nº 974 série 1 da venda #31601 · pedida')
})

test('moto arquivada mostra chassi, modelo e o motivo (#688)', () => {
  const resumo = resumoDoEvento(ev({ tipo: 'moto_arquivada', detalhe: { motoId: 'm1', chassi: 'ABC123', modelo: 'JET', loja: 'Lavras', nfEntrada: '123', motivo: 'golpe' } }))
  assert.equal(resumo, 'ABC123 · JET · “golpe”')
})

test('moto arquivada aparece como ação sensível, com rótulo próprio', () => {
  assert.equal(ehSensivel('moto_arquivada'), true)
  assert.equal(ROTULO_TIPO.moto_arquivada, 'Arquivou moto')
})

test('moto desarquivada (#691): rótulo próprio, sensível, com chassi, modelo e o motivo', () => {
  const resumo = resumoDoEvento(ev({ tipo: 'moto_desarquivada', detalhe: { motoId: 'm1', chassi: 'ABC123', modelo: 'JET', loja: 'Lavras', nfEntrada: '123', motivo: 'achamos o dono' } }))
  assert.equal(resumo, 'ABC123 · JET · “achamos o dono”')
  assert.equal(ehSensivel('moto_desarquivada'), true)
  assert.equal(ROTULO_TIPO.moto_desarquivada, 'Desarquivou moto')
})

test('moto removida (#692): rótulo próprio, sensível, com chassi, modelo e o motivo', () => {
  const resumo = resumoDoEvento(ev({ tipo: 'moto_removida', detalhe: { motoId: 'm1', chassi: 'ABC123', modelo: 'JET', loja: 'Lavras', nfEntrada: '123', motivo: 'NF do grupo errado', saiu: { historico: 1 } } }))
  assert.equal(resumo, 'ABC123 · JET · “NF do grupo errado”')
  assert.equal(ehSensivel('moto_removida'), true)
  assert.equal(ROTULO_TIPO.moto_removida, 'Removeu moto')
})
