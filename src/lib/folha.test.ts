import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolverBaseComissao, isBaseComissao, isTipoAjuste, type TotaisBase } from './folha'
import { temPapel } from './auth'

const TOTAIS: TotaisBase = {
  propriasMotos:    100,
  propriasPecas:    200,
  propriosServicos: 300,
  lojaMotos:        1000,
  lojaPecas:        2000,
}

// ─── base 'padrao' reproduz o comportamento histórico, derivado do papel ──────

test('padrão: vendedor comissiona sobre as motos dele', () => {
  assert.equal(resolverBaseComissao('padrao', 'vendedor', TOTAIS), 100)
})

test('padrão: mecânico comissiona sobre a mão de obra dele', () => {
  assert.equal(resolverBaseComissao('padrao', 'mecanico', TOTAIS), 300)
})

test('padrão: aux_adm comissiona sobre as peças dele', () => {
  assert.equal(resolverBaseComissao('padrao', 'aux_adm', TOTAIS), 200)
})

test('padrão: papel sem comissão não tem base', () => {
  assert.equal(resolverBaseComissao('padrao', 'admin_socio', TOTAIS), 0)
})

// ─── bases explícitas ignoram o papel ────────────────────────────────────────

test('Charles: aux_adm com base nas motos da loja', () => {
  assert.equal(resolverBaseComissao('loja_motos', 'aux_adm', TOTAIS), 1000)
})

test('Pedro Henrique: aux_adm com base nas peças da loja', () => {
  assert.equal(resolverBaseComissao('loja_pecas', 'aux_adm', TOTAIS), 2000)
})

test('Tiago: aux_adm que vende, base nas motos dele', () => {
  assert.equal(resolverBaseComissao('proprias_motos', 'aux_adm', TOTAIS), 100)
})

test('base desconhecida cai no padrão em vez de zerar a comissão', () => {
  assert.equal(resolverBaseComissao('base_que_nao_existe', 'vendedor', TOTAIS), 100)
})

// ─── validação ───────────────────────────────────────────────────────────────

test('valida base de comissão contra a lista fechada', () => {
  assert.equal(isBaseComissao('loja_pecas'), true)
  assert.equal(isBaseComissao('loja_servicos'), false)
})

test('valida tipo de ajuste contra a lista fechada', () => {
  assert.equal(isTipoAjuste('servicos'), true)
  assert.equal(isTipoAjuste('outros'), false)
})

// ─── papéis acumulados ───────────────────────────────────────────────────────

test('papel principal conta', () => {
  assert.equal(temPapel({ papel: 'vendedor' }, 'vendedor'), true)
})

test('papel extra conta', () => {
  assert.equal(temPapel({ papel: 'aux_adm', papeisExtras: ['vendedor'] }, 'vendedor'), true)
})

test('sem o papel, nem principal nem extra', () => {
  assert.equal(temPapel({ papel: 'aux_adm', papeisExtras: [] }, 'vendedor'), false)
  assert.equal(temPapel({ papel: 'aux_adm' }, 'vendedor'), false)
  assert.equal(temPapel({ papel: 'aux_adm', papeisExtras: null }, 'vendedor'), false)
})

test('papel extra não promove a admin por tabela', () => {
  assert.equal(temPapel({ papel: 'aux_adm', papeisExtras: ['vendedor'] }, 'admin_geral'), false)
})
