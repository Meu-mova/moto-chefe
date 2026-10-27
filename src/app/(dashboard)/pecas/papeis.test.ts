import test from 'node:test'
import assert from 'node:assert'
import { lojaDoEstoque, podeGerirPecas, podeVenderPeca } from './papeis'

// Estas listas viviam duplicadas em page.tsx e actions.ts. A cópia desalinhada
// foi o que derrubou a página de Peças para o mecânico: a guarda deixava entrar
// e a action barrava. Os testes fixam a política, para que afrouxar uma das
// pontas sem querer apareça aqui.

test('quem gere peças define preço e vê os pedidos da fábrica', () => {
  assert.equal(podeGerirPecas('admin_geral'), true)
  assert.equal(podeGerirPecas('admin_socio'), true)
  assert.equal(podeGerirPecas('aux_adm'), true)
  assert.equal(podeGerirPecas('vendedor'), false)
  assert.equal(podeGerirPecas('mecanico'), false)
})

test('vendedor vende peça, mas não gere o catálogo', () => {
  assert.equal(podeVenderPeca('vendedor'), true)
  assert.equal(podeGerirPecas('vendedor'), false)
})

test('mecânico não vende peça — só consulta o catálogo', () => {
  assert.equal(podeVenderPeca('mecanico'), false)
})

test('quem gere também vende', () => {
  for (const papel of ['admin_geral', 'admin_socio', 'aux_adm']) {
    assert.equal(podeVenderPeca(papel), true, `${papel} deveria poder vender`)
  }
})

test('papel desconhecido não ganha nada por omissão', () => {
  assert.equal(podeGerirPecas('financeiro'), false)
  assert.equal(podeVenderPeca('financeiro'), false)
})

// Estoque por loja (#195): só o admin vê e ajusta outras lojas, e só as que lhe cabem.
test('usuário de loja vê e ajusta só a própria loja, mesmo pedindo outra', () => {
  for (const papel of ['aux_adm', 'vendedor']) {
    assert.equal(lojaDoEstoque({ papel, lojaId: 'X' }, ['X', 'Y'], 'Y'), 'X')
  }
})

test('admin escolhe entre as lojas permitidas; fora delas não ganha loja nenhuma', () => {
  assert.equal(lojaDoEstoque({ papel: 'admin_socio', lojaId: 'X' }, ['X', 'Y'], 'Y'), 'Y')
  assert.equal(lojaDoEstoque({ papel: 'admin_geral', lojaId: null }, ['X', 'Y'], 'Z'), null)
})

test('admin sem loja pedida fica na própria, ou na primeira permitida', () => {
  assert.equal(lojaDoEstoque({ papel: 'admin_socio', lojaId: 'Y' }, ['X', 'Y']), 'Y')
  assert.equal(lojaDoEstoque({ papel: 'admin_geral', lojaId: null }, ['X', 'Y']), 'X')
  assert.equal(lojaDoEstoque({ papel: 'admin_geral', lojaId: 'Z' }, ['X', 'Y']), 'X')
})
