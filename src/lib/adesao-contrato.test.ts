import { test } from 'node:test'
import assert from 'node:assert/strict'
import { lerDadosContrato, statusDaAdesao } from './adesao-contrato'
import { mensagemRecusa } from './adesao-recusa'
import { camposFaltando } from './adesao-campos'

const completo = {
  razaoSocial: 'ECOMOTO LAVRAS COMERCIO LTDA',
  cnpj: '11.222.333/0001-81',
  enderecoSede: 'Rua A, 100, Centro, Lavras/MG',
  email: 'contato@ecomoto.com.br',
  responsavelCpf: '529.982.247-25',
  taxaImplantacao: '999,00',
  valorMensal: '499,00',
}

test('lerDadosContrato aceita dados completos e grava documentos só com dígitos', () => {
  const r = lerDadosContrato(completo)
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.dados.cnpj, '11222333000181')
  assert.equal(r.dados.responsavelCpf, '52998224725')
  assert.equal(r.dados.valorMensal, '499.00')
  assert.equal(r.dados.taxaImplantacao, '999.00')
  assert.equal(r.dados.franqueadoMotochefe, false)
})

test('lerDadosContrato aceita salvar parcial: campo vazio vira null', () => {
  const r = lerDadosContrato({ razaoSocial: 'VOLT MOTOS LTDA' })
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.dados.razaoSocial, 'VOLT MOTOS LTDA')
  assert.equal(r.dados.cnpj, null)
  assert.equal(r.dados.taxaImplantacao, null)
})

test('lerDadosContrato recusa CNPJ e CPF com dígito verificador errado', () => {
  const r = lerDadosContrato({ ...completo, cnpj: '11.222.333/0001-82', responsavelCpf: '529.982.247-26' })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(r.erros.cnpj)
  assert.ok(r.erros.responsavelCpf)
})

test('lerDadosContrato recusa e-mail inválido e valores zerados', () => {
  for (const [campo, valor] of [['email', 'sem-arroba'], ['valorMensal', '0'], ['taxaImplantacao', '0']] as const) {
    const r = lerDadosContrato({ ...completo, [campo]: valor })
    assert.equal(r.ok, false, `${campo}=${valor}`)
    if (!r.ok) assert.ok(r.erros[campo], campo)
  }
})

test('camposFaltando lista os rótulos do que falta para o contrato', () => {
  assert.deepEqual(camposFaltando({ razaoSocial: 'X' }).length, 6)
  assert.deepEqual(camposFaltando(lerOk(completo)), [])
})

test('lerDadosContrato guarda a marcação de franqueado', () => {
  const r = lerDadosContrato({ ...completo, franqueadoMotochefe: true })
  assert.equal(r.ok && r.dados.franqueadoMotochefe, true)
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

test('lerDadosContrato monta o endereço da sede a partir dos campos', () => {
  const r = lerDadosContrato({ ...completo, enderecoSede: 'texto antigo', sede: { cep: '78010400', logradouro: 'Av. A', numero: '7', bairro: 'Areão', cidade: 'Cuiabá', uf: 'mt' } })
  assert.ok(r.ok)
  assert.equal(r.dados.enderecoSede, 'Av. A, 7, Areão, CEP 78010-400, Cuiabá – MT')
  assert.equal(r.dados.sede?.sedeUf, 'MT')
})

test('lerDadosContrato: campos incompletos não apagam a linha que já vale; sem linha, o contrato aguarda', () => {
  const comAntigo = lerDadosContrato({ ...completo, sede: { cep: '78010-400', cidade: 'Cuiabá' } })
  assert.ok(comAntigo.ok)
  assert.equal(comAntigo.dados.enderecoSede, completo.enderecoSede, 'texto antigo continua valendo')
  assert.equal(comAntigo.dados.sede?.sedeCidade, 'Cuiabá', 'os campos parciais são gravados')

  const semLinha = lerDadosContrato({ ...completo, enderecoSede: '', sede: { cep: '78010-400', cidade: 'Cuiabá' } })
  assert.ok(semLinha.ok)
  assert.equal(semLinha.dados.enderecoSede, null)
  assert.equal(statusDaAdesao(semLinha.dados), 'pendente')

  const ruim = lerDadosContrato({ ...completo, sede: { uf: 'ZZ' } })
  assert.ok(!ruim.ok && ruim.erros.enderecoSede === 'UF inválida')
})

test('lerDadosContrato: campos esvaziados limpam as colunas e mantêm a linha do contrato', () => {
  const r = lerDadosContrato({ ...completo, sede: { cep: ' ' } })
  assert.ok(r.ok)
  assert.equal(r.dados.enderecoSede, completo.enderecoSede)
  assert.ok(r.dados.sede && Object.values(r.dados.sede).every(v => v === null))
})

test('lerDadosContrato sem campos de endereço (tela antiga) mantém só o texto', () => {
  const r = lerDadosContrato(completo)
  assert.ok(r.ok)
  assert.equal(r.dados.enderecoSede, completo.enderecoSede)
  assert.equal(r.dados.sede, undefined)
})
