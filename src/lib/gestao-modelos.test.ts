import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contaDoModeloNovo, podeEditarModelo } from './gestao-modelos'

const contaA = 'conta-a'
const contaB = 'conta-b'
const geral = { papel: 'admin_geral', contaId: null }
const socioA = { papel: 'admin_socio', contaId: contaA }
const auxA = { papel: 'aux_adm', contaId: contaA }

test('admin_geral edita qualquer modelo', () => {
  assert.equal(podeEditarModelo(geral, { contaId: null }), true)
  assert.equal(podeEditarModelo(geral, { contaId: contaA }), true)
})

test('sócio edita só os modelos da própria Conta', () => {
  assert.equal(podeEditarModelo(socioA, { contaId: contaA }), true)
  assert.equal(podeEditarModelo(socioA, { contaId: contaB }), false, 'de outra Conta')
  assert.equal(podeEditarModelo(socioA, { contaId: null }), false, 'da plataforma')
})

test('aux_adm não edita modelo', () => {
  assert.equal(podeEditarModelo(auxA, { contaId: contaA }), false)
})

test('modelo novo: do admin_geral é da plataforma, do sócio é da Conta dele', () => {
  assert.equal(contaDoModeloNovo(geral), null)
  assert.equal(contaDoModeloNovo(socioA), contaA)
  assert.throws(() => contaDoModeloNovo(auxA))
})
