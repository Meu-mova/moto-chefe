import { test } from 'node:test'
import assert from 'node:assert/strict'
import { usuarioComCargo } from './usuario-com-cargo'
import { usuarioDaRede } from './grupos-liberados'
import { itensVisiveis } from './navegacao'
import { aprovaEmGrupoExtra } from './aprovacao-permissao'
import { PAPEIS_QUE_CANCELAM_VENDA } from './cancelar-venda'
import { podeOperarNfSaida } from '../app/(dashboard)/vendas/papeis-nf-saida'

const base = (papel: string, extra = {}) => ({
  papel, lojaId: 'loja', contaId: 'conta', gruposAcesso: [], gruposAprovacao: ['grupo'], email: 'a@teste.invalid',
  modulosExtras: [] as string[], modulosBloqueados: [] as string[], ...extra,
})
// Como a sessão monta: a tradução do admin_rede primeiro, a do cargo depois.
const sessao = (u: ReturnType<typeof base>, cargo: Parameters<typeof usuarioComCargo>[1]) =>
  usuarioComCargo(usuarioDaRede(u, [], null), cargo)
const ids = (u: Parameters<typeof itensVisiveis>[0]) => itensVisiveis(u, {}).map(i => i.id)

test('cargo de base adm. da loja: cancela venda e emite NF como o aux_adm, opera o caixa e não aprova', () => {
  const u = sessao(base('cargo'), { nome: 'Gerente', papelBase: 'aux_adm' })
  assert.equal(u.papel, 'aux_adm')
  assert.equal(u.papelReal, 'cargo')
  assert.equal(u.cargoNome, 'Gerente')
  assert.equal(PAPEIS_QUE_CANCELAM_VENDA.has(u.papel), true)
  assert.equal(podeOperarNfSaida(u.papel), true)
  assert.ok(ids(u).includes('caixa'))
  assert.equal(aprovaEmGrupoExtra(u, 'grupo'), false)
})

test('cargo de base sócio: aprova venda como o sócio', () => {
  const u = sessao(base('cargo'), { nome: 'Gerente_admin', papelBase: 'admin_socio' })
  assert.equal(u.papel, 'admin_socio')
  assert.equal(aprovaEmGrupoExtra(u, 'grupo'), true)
})

test('cargo de base motorista vê só o básico', () => {
  const u = sessao(base('cargo'), { nome: 'Faxineira', papelBase: 'motorista' })
  assert.equal(u.papel, 'motorista')
  assert.deepEqual(ids(u).sort(), ['calendario', 'dashboard', 'meus-documentos'])
})

test('a exceção por pessoa vale por cima do cargo', () => {
  const gerente = { nome: 'Gerente', papelBase: 'aux_adm' } as const
  assert.ok(ids(sessao(base('cargo'), gerente)).includes('caixa'))
  assert.equal(ids(sessao(base('cargo', { modulosBloqueados: ['caixa'] }), gerente)).includes('caixa'), false)
})

test('usuário sem cargo não muda', () => {
  const u = sessao(base('vendedor'), null)
  assert.equal(u.papel, 'vendedor')
  assert.equal(u.cargoNome, null)
})

test('cargo que a consulta não achou fica no papel cargo, só com o básico', () => {
  const u = sessao(base('cargo'), null)
  assert.equal(u.papel, 'cargo')
  assert.equal(u.cargoNome, null)
  assert.deepEqual(ids(u).sort(), ['calendario', 'dashboard', 'meus-documentos'])
})

test('admin_rede continua sócio: o cargo não mexe nele', () => {
  const u = sessao(base('admin_rede'), { nome: 'Gerente', papelBase: 'motorista' })
  assert.equal(u.papel, 'admin_socio')
  assert.equal(u.papelReal, 'admin_rede')
  assert.equal(u.cargoNome, null)
})
