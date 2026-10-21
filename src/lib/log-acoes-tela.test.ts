import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agruparPorPessoa, contaDoFiltro, dispositivoLegivel, resumoDoEvento, type EventoLog } from './log-acoes-tela'

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
  assert.equal(agruparPorPessoa([ev({ usuarioNome: null })])[0].nome, 'Usuário excluído')
})

test('resumo de cada ação sensível', () => {
  assert.equal(resumoDoEvento(ev({ tipo: 'venda_cancelada', detalhe: { numeroVenda: 30035, cliente: 'Fulano', valor: '7990.00', motivo: 'desistiu' } })), 'Venda #30035 · Fulano · R$ 7.990,00 · “desistiu”')
  assert.equal(resumoDoEvento(ev({ tipo: 'nf_emitida', detalhe: { origem: 'mova', numeroNf: '415', numeroVenda: 30041, ambiente: 'Homologacao', status: 'Autorizada' } })), 'NF 415 da venda #30041 · Autorizada · homologação')
  assert.equal(resumoDoEvento(ev({ tipo: 'nf_cancelada', detalhe: { numeroNf: '415', motivo: 'erro', extemporaneo: true, ambiente: 'Producao' } })), 'NF 415 · “erro” · extemporâneo')
  assert.equal(resumoDoEvento(ev({ tipo: 'permissao_alterada', detalhe: { alvoNome: 'Bruno', acao: 'alterado', campos: ['papel'], papelAntes: 'vendedor', papel: 'aux_adm' } })), 'Bruno · alterado: papel (vendedor → aux_adm)')
  assert.equal(resumoDoEvento(ev({ tipo: 'troca_grupo', detalhe: { de: 'g1' } })), 'Entrou em Sul')
})

test('admin da Conta só vê a própria; admin_geral escolhe (ou vê todas)', () => {
  assert.deepEqual(contaDoFiltro({ papel: 'admin_socio', contaId: 'c1' }, 'c2'), { contaId: 'c1' })
  assert.deepEqual(contaDoFiltro({ papel: 'admin_socio', contaId: null }, undefined), null)
  assert.deepEqual(contaDoFiltro({ papel: 'admin_geral', contaId: null }, 'c2'), { contaId: 'c2' })
  assert.deepEqual(contaDoFiltro({ papel: 'admin_geral', contaId: null }, ''), { contaId: 'todas' })
})
