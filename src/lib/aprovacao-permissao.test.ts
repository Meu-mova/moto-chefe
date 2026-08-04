import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  aprovaBaixoValorEmQualquerGrupo,
  socioAprovaNoGrupo,
  EMAIL_ACESSO_MULTI_GRUPO,
} from './aprovacao-permissao'

const SUL_DE_MINAS = 'grupo-sdm'
const BH = 'grupo-bh'

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
