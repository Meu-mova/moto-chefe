// Regra das Novidades da versão (#883): quem vê e qual versão. A entrada é a da casca do layout:
// o `papelReal` da sessão montada como o getUsuarioLogado monta e a versão gravada no cookie.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { novidadeParaMostrar } from './regra'
import { usuarioComCargo } from '../usuario-com-cargo'
import { usuarioDaRede } from '../grupos-liberados'
import type { NovidadeDaVersao } from './tipos'

const versao = (v: string): NovidadeDaVersao => ({ versao: v, data: '2026-11-13', novidades: [{ titulo: `Item ${v}`, texto: 'Texto.' }] })
const lista = [versao('1.36.0')]
const versaoMostrada = (l: readonly NovidadeDaVersao[], papel: string, vista: string | null) => novidadeParaMostrar(l, papel, vista)?.versao ?? null

const cadastro = (papel: string, extra = {}) => ({ papel, lojaId: 'loja', contaId: 'conta', gruposAcesso: [], gruposAprovacao: [], papeisExtras: [] as string[], ...extra })
// Como a sessão monta: a tradução do admin_rede primeiro, a do cargo depois (auth.ts).
const papelCadastradoDaSessao = (u: ReturnType<typeof cadastro>, cargo: Parameters<typeof usuarioComCargo>[1] = null) =>
  usuarioComCargo(usuarioDaRede(u, [], null), cargo).papelReal

test('admin_geral, admin_socio, admin_rede e aux_adm veem a mais nova, sem nada visto', () => {
  for (const papel of ['admin_geral', 'admin_socio', 'admin_rede', 'aux_adm']) {
    assert.equal(versaoMostrada(lista, papelCadastradoDaSessao(cadastro(papel)), null), '1.36.0', papel)
  }
})

test('vendedor, mecânico, motorista e cargo sem cargo achado não veem', () => {
  for (const papel of ['vendedor', 'mecanico', 'motorista', 'cargo']) {
    assert.equal(versaoMostrada(lista, papelCadastradoDaSessao(cadastro(papel)), null), null, papel)
  }
})

test('cargo personalizado não vê, qualquer que seja a base (opera como adm, mas o papel cadastrado é cargo)', () => {
  for (const papelBase of ['admin_socio', 'aux_adm', 'vendedor'] as const) {
    assert.equal(versaoMostrada(lista, papelCadastradoDaSessao(cadastro('cargo'), { nome: 'Gerente', papelBase }), null), null, papelBase)
  }
})

test('função extra de adm não faz ver: vendedor que também é aux_adm', () => {
  assert.equal(versaoMostrada(lista, papelCadastradoDaSessao(cadastro('vendedor', { papeisExtras: ['aux_adm'] })), null), null)
})

test('a mais nova é decidida pela versão, não pela posição nem pela ordem do texto', () => {
  assert.equal(versaoMostrada([versao('1.9.0'), versao('1.10.0')], 'aux_adm', null), '1.10.0')
  assert.equal(versaoMostrada([versao('1.10.0'), versao('1.9.0')], 'aux_adm', null), '1.10.0')
  assert.equal(versaoMostrada([versao('2.0.0'), versao('1.40.3')], 'aux_adm', null), '2.0.0')
})

test('já vista não mostra', () => {
  assert.equal(versaoMostrada(lista, 'aux_adm', '1.36.0'), null)
})

test('versão nova depois de uma vista volta a mostrar, e só a mais nova', () => {
  assert.equal(versaoMostrada([versao('1.36.0'), versao('1.37.0'), versao('1.38.0')], 'aux_adm', '1.36.0'), '1.38.0')
})

test('versão só interna, sem texto, não esconde a anterior ainda não vista', () => {
  // A 1.37.0 subiu sem Novidades da versão: não está na lista, e a 1.36.0 continua a mostrar.
  assert.equal(versaoMostrada(lista, 'aux_adm', null), '1.36.0')
  assert.equal(versaoMostrada(lista, 'aux_adm', '1.35.0'), '1.36.0')
})

test('quem já viu uma versão maior que a mais nova da lista não vê de novo (versão tirada do ar)', () => {
  assert.equal(versaoMostrada(lista, 'aux_adm', '1.37.0'), null)
})

test('cookie com valor que não é versão conta como não visto', () => {
  assert.equal(versaoMostrada(lista, 'aux_adm', 'abc'), '1.36.0')
  assert.equal(versaoMostrada(lista, 'aux_adm', ''), '1.36.0')
})

test('lista vazia não mostra nada', () => {
  assert.equal(versaoMostrada([], 'admin_geral', null), null)
})
