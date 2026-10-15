import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerDadosContrato, statusDaAdesao, mensagemRecusa } from './adesao-contrato'
import { camposFaltando } from './adesao-campos'

const completo = {
  razaoSocial: 'ECOMOTO LAVRAS COMERCIO LTDA',
  cnpj: '11.222.333/0001-81',
  enderecoSede: 'Rua A, 100, Centro, Lavras/MG',
  email: 'contato@ecomoto.com.br',
  responsavelCpf: '529.982.247-25',
  valorMensal: '490,00',
  diaVencimento: '10',
}

test('lerDadosContrato aceita dados completos e grava documentos só com dígitos', () => {
  const r = lerDadosContrato(completo)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.dados.cnpj, '11222333000181')
  assert.equal(r.dados.responsavelCpf, '52998224725')
  assert.equal(r.dados.valorMensal, '490.00')
  assert.equal(r.dados.diaVencimento, 10)
})

test('lerDadosContrato aceita salvar parcial: campo vazio vira null', () => {
  const r = lerDadosContrato({ razaoSocial: 'VOLT MOTOS LTDA' })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.dados.razaoSocial, 'VOLT MOTOS LTDA')
  assert.equal(r.dados.cnpj, null)
  assert.equal(r.dados.diaVencimento, null)
})

test('lerDadosContrato recusa CNPJ e CPF com dígito verificador errado', () => {
  const r = lerDadosContrato({ ...completo, cnpj: '11.222.333/0001-82', responsavelCpf: '529.982.247-26' })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(r.erros.cnpj)
  assert.ok(r.erros.responsavelCpf)
})

test('lerDadosContrato recusa e-mail inválido, valor zero e dia fora de 1 a 28', () => {
  for (const [campo, valor] of [['email', 'sem-arroba'], ['valorMensal', '0'], ['diaVencimento', '29'], ['diaVencimento', '0']] as const) {
    const r = lerDadosContrato({ ...completo, [campo]: valor })
    assert.equal(r.ok, false, `${campo}=${valor}`)
    if (!r.ok) assert.ok(r.erros[campo], campo)
  }
})

test('camposFaltando lista os rótulos do que falta para o contrato', () => {
  assert.deepEqual(camposFaltando({ razaoSocial: 'X' }).length, 6)
  assert.deepEqual(camposFaltando(lerOk(completo)), [])
})

test('statusDaAdesao: completo vira dados_completos, incompleto volta a pendente', () => {
  assert.equal(statusDaAdesao(lerOk(completo)), 'dados_completos')
  assert.equal(statusDaAdesao(lerOk({ ...completo, email: '' })), 'pendente')
})

test('mensagemRecusa leva a loja e o motivo', () => {
  const m = mensagemRecusa('EcoMoto Lavras', 'CNPJ baixado na Receita')
  assert.match(m, /EcoMoto Lavras/)
  assert.match(m, /CNPJ baixado na Receita/)
})

function lerOk(v: Parameters<typeof lerDadosContrato>[0]) {
  const r = lerDadosContrato(v)
  if (!r.ok) throw new Error(JSON.stringify(r.erros))
  return r.dados
}
