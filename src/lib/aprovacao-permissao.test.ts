import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aprovaBaixoValorEmQualquerGrupo,
  aprovaEmGrupoExtra,
  aprovaPagamentoSensivelNoGrupo,
  socioAprovaNoGrupo,
  EMAIL_ACESSO_MULTI_GRUPO,
} from './aprovacao-permissao'

const SUL_DE_MINAS = 'grupo-sdm'
const BH = 'grupo-bh'
const VALE = 'grupo-vale'

test('admin_geral aprova em qualquer grupo', () => {
  assert.equal(aprovaBaixoValorEmQualquerGrupo({ papel: 'admin_geral', email: 'x@y.com' }), true)
})

// O bug: o sócio multi-grupo (loja fixa no Sul de Minas) não conseguia aprovar
// no BH porque o gate amarrava a aprovação ao grupo da loja fixa dele.
test('usuário multi-grupo aprova em qualquer grupo (Sul de Minas E BH)', () => {
  assert.equal(
    aprovaBaixoValorEmQualquerGrupo({ papel: 'admin_socio', email: EMAIL_ACESSO_MULTI_GRUPO }),
    true,
  )
})

test('admin_socio comum não aprova fora do próprio grupo', () => {
  assert.equal(aprovaBaixoValorEmQualquerGrupo({ papel: 'admin_socio', email: 'socio.bh@y.com' }), false)
})

test('vendedor nunca é aprovador global', () => {
  assert.equal(aprovaBaixoValorEmQualquerGrupo({ papel: 'vendedor', email: 'v@y.com' }), false)
})

test('admin_socio aprova venda do próprio grupo', () => {
  assert.equal(
    socioAprovaNoGrupo({ papel: 'admin_socio', lojaId: 'loja-bh' }, BH, BH),
    true,
  )
})

test('admin_socio não aprova venda de outro grupo', () => {
  assert.equal(
    socioAprovaNoGrupo({ papel: 'admin_socio', lojaId: 'loja-bh' }, SUL_DE_MINAS, BH),
    false,
  )
})

test('sem loja fixa, admin_socio não aprova por grupo', () => {
  assert.equal(
    socioAprovaNoGrupo({ papel: 'admin_socio', lojaId: null }, BH, BH),
    false,
  )
})

test('não-sócio não passa pela regra de grupo', () => {
  assert.equal(
    socioAprovaNoGrupo({ papel: 'aux_adm', lojaId: 'loja-bh' }, BH, BH),
    false,
  )
})

// ─── grupos liberados no cadastro (usuarios.grupos_aprovacao) ─────────────────
// Caso do João Brito: loja fixa em Itajubá (Sul de Minas), liberado no BH e no Vale.

const JOAO = {
  papel: 'admin_socio',
  email: 'joao.brito@motochefesuldeminas.com.br',
  lojaId: 'loja-itajuba',
  gruposAprovacao: [BH, VALE],
  aprovaPagamentoSensivel: true,
}

test('sócio liberado aprova baixo valor no grupo extra', () => {
  assert.equal(aprovaEmGrupoExtra(JOAO, BH), true)
  assert.equal(aprovaEmGrupoExtra(JOAO, VALE), true)
})

test('grupo fora da lista não é liberado pelo cadastro', () => {
  // Sul de Minas não está na lista — ele aprova lá pela loja fixa (socioAprovaNoGrupo).
  assert.equal(aprovaEmGrupoExtra(JOAO, SUL_DE_MINAS), false)
})

test('grupo extra não vale para papel que não aprova', () => {
  assert.equal(
    aprovaEmGrupoExtra({ ...JOAO, papel: 'vendedor' }, BH),
    false,
  )
})

test('sem grupos no cadastro, nada é liberado', () => {
  const socioComum = { papel: 'admin_socio', email: 'luiz@y.com', lojaId: 'loja-x' }
  assert.equal(aprovaEmGrupoExtra(socioComum, BH), false)
})

// ─── financiamento / transferência ────────────────────────────────────────────

test('João aprova financiamento no grupo da loja dele e nos grupos extras', () => {
  assert.equal(aprovaPagamentoSensivelNoGrupo(JOAO, SUL_DE_MINAS, SUL_DE_MINAS), true)
  assert.equal(aprovaPagamentoSensivelNoGrupo(JOAO, BH, SUL_DE_MINAS), true)
  assert.equal(aprovaPagamentoSensivelNoGrupo(JOAO, VALE, SUL_DE_MINAS), true)
})

test('sócio sem a liberação não aprova financiamento nem no próprio grupo', () => {
  const socioComum = {
    papel: 'admin_socio',
    email: 'luiz.paulo@motochefesuldeminas.com.br',
    lojaId: 'loja-galpao',
    gruposAprovacao: [],
    aprovaPagamentoSensivel: false,
  }
  assert.equal(aprovaPagamentoSensivelNoGrupo(socioComum, SUL_DE_MINAS, SUL_DE_MINAS), false)
})

test('usuário multi-grupo continua aprovando financiamento em qualquer grupo', () => {
  const cesar = { papel: 'admin_geral', email: EMAIL_ACESSO_MULTI_GRUPO, lojaId: null }
  assert.equal(aprovaPagamentoSensivelNoGrupo(cesar, BH, null), true)
})

// admin_geral não ganha financiamento pelo cargo — é liberação nominal.
test('admin_geral sem a liberação não aprova financiamento', () => {
  const outroAdmin = { papel: 'admin_geral', email: 'admin@motochefe.com', lojaId: null }
  assert.equal(aprovaPagamentoSensivelNoGrupo(outroAdmin, BH, null), false)
})

test('liberação de financiamento não vale fora dos grupos do usuário', () => {
  const soBH = { ...JOAO, gruposAprovacao: [BH] }
  assert.equal(aprovaPagamentoSensivelNoGrupo(soBH, VALE, SUL_DE_MINAS), false)
})

test('financiamento não vale para papel que não aprova', () => {
  assert.equal(
    aprovaPagamentoSensivelNoGrupo({ ...JOAO, papel: 'aux_adm' }, BH, SUL_DE_MINAS),
    false,
  )
})
