import { test } from 'node:test'
import assert from 'node:assert/strict'
import { cpfValido } from '../../src/lib/documento'
import { calcLiquidoRecebido } from '../../src/lib/preco-minimo'
import {
  DOMINIO_TESTE, GRUPOS, LOJAS, TAXAS,
  gerarCnpj, gerarCpf, grupoDaLoja, minimoDoModelo, montarMotos, montarReservas, montarUsuarios,
} from './seed-dados'

test('CPFs gerados passam no validador do app', () => {
  for (let n = 0; n < 200; n++) assert.equal(cpfValido(gerarCpf(n)), true, gerarCpf(n))
})

test('CNPJ gerado bate com um CNPJ de dígitos conhecidos', () => {
  // 11.222.333/0001-81: exemplo clássico de CNPJ válido.
  assert.equal(gerarCnpj(11222333), '11222333000181')
})

test('3 grupos e 8 lojas, toda loja num grupo existente', () => {
  assert.equal(GRUPOS.length, 3)
  assert.equal(LOJAS.length, 8)
  for (const l of LOJAS) assert.ok(GRUPOS.some(g => g.chave === l.grupo))
})

test('todo usuário de teste é do domínio de teste, sem e-mail repetido', () => {
  const usuarios = montarUsuarios()
  assert.equal(usuarios.length, 16)
  assert.ok(usuarios.every(u => u.email.endsWith(`@${DOMINIO_TESTE}`)))
  assert.equal(new Set(usuarios.map(u => u.email)).size, usuarios.length)
})

test('quem não é admin_geral tem CPF válido e loja (senão cai em /completar-cadastro)', () => {
  for (const u of montarUsuarios().filter(u => u.papel !== 'admin_geral')) {
    assert.ok(u.cpf && cpfValido(u.cpf), u.email)
    assert.ok(u.loja, u.email)
  }
})

test('cada grupo tem um aux_adm que não aprova transferência e um sócio que aprova', () => {
  const usuarios = montarUsuarios()
  for (const g of GRUPOS) {
    const doGrupo = usuarios.filter(u => LOJAS.find(l => l.chave === u.loja)?.grupo === g.chave)
    assert.ok(doGrupo.some(u => u.papel === 'aux_adm' && !u.aprovaPagamentoSensivel), g.chave)
    assert.ok(doGrupo.some(u => u.papel === 'admin_socio' && u.aprovaPagamentoSensivel), g.chave)
  }
})

test('chassis únicos e 4 motos reservadas, cada uma com uma reserva', () => {
  const motos = montarMotos()
  assert.equal(new Set(motos.map(m => m.chassi)).size, motos.length)
  const reservadas = motos.filter(m => m.disponibilidade === 'reservada')
  assert.equal(reservadas.length, 4)
  assert.deepEqual(montarReservas(motos).map(r => r.chassi).sort(), reservadas.map(m => m.chassi).sort())
  assert.ok(reservadas.every(m => m.status === 'montada'))
})

test('cada reserva está na loja do aux_adm do seu grupo (senão não aparece "Finalizar Venda" para ele)', () => {
  const usuarios = montarUsuarios()
  for (const r of montarReservas(montarMotos())) {
    const aux = usuarios.find(u => u.papel === 'aux_adm' && u.loja && grupoDaLoja(u.loja) === grupoDaLoja(r.loja))!
    assert.equal(r.loja, aux.loja, r.chave)
  }
})

test('há reserva com total abaixo do mínimo e reserva com entrada por transferência', () => {
  const motos = montarMotos()
  const reservas = montarReservas(motos)
  const minimoDe = (chassi: string) => minimoDoModelo(motos.find(m => m.chassi === chassi)!.modelo)
  assert.ok(reservas.some(r => r.valorTotalVenda < minimoDe(r.chassi)))
  assert.ok(reservas.some(r => r.pagamentos.some(p => p.tipo === 'transferencia')))
})

test('a reserva comum fica acima do mínimo pelo mesmo cálculo da tela de venda', () => {
  const motos = montarMotos()
  const comum = montarReservas(motos).find(r => r.chave === 'comum')!
  const minimo = minimoDoModelo(motos.find(m => m.chassi === comum.chassi)!.modelo)
  assert.ok(calcLiquidoRecebido([{ tipo: 'pix', valor: comum.valorTotalVenda }], TAXAS) >= minimo)
})
