import { test } from 'node:test'
import assert from 'node:assert/strict'
import { contaDoModeloNovo, podeAjustarModelo, podeCadastrarModelo, podeEditarModelo, potenciaNaTela } from './gestao-modelos'

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
  assert.deepEqual([geral, socioA, auxA].map(podeCadastrarModelo), [true, true, false])
})

test('ajuste de modelo da plataforma: só o sócio, na própria Conta', () => {
  assert.equal(podeAjustarModelo(socioA, { contaId: null }), true)
  assert.equal(podeAjustarModelo(socioA, { contaId: contaA }), false, 'o da Conta se edita, não se ajusta')
  assert.equal(podeAjustarModelo(socioA, { contaId: contaB }), false, 'de outra Conta')
  assert.equal(podeAjustarModelo(geral, { contaId: null }), false, 'o admin_geral edita o original')
  assert.equal(podeAjustarModelo(auxA, { contaId: null }), false)
})

test('potência na tela com um W só, venha o cadastro com ou sem W', () => {
  assert.equal(potenciaNaTela('1000'), '1000W')
  assert.equal(potenciaNaTela('1000 W'), '1000W')
  assert.equal(potenciaNaTela('1000w'), '1000W')
  assert.equal(potenciaNaTela(''), '')
})
