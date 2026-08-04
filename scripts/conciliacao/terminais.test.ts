import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  seriaisDasTransacoes,
  conflitosDeTerminal,
  registrarTerminais,
} from './terminais'
import type { TransacaoCartao } from '../../src/lib/conciliacao-cartao'

const base = { dataTransacao: '2026-08-03', valorBruto: 100, parcelas: 1, tipo: 'credito' as const, status: 'aprovado' }

test('serial vem de serial_number (InfinitePay/Stone) e de terminal (PagueVeloz)', () => {
  const transacoes: TransacaoCartao[] = [
    { ...base, rawData: { serial_number: 'PB1F248T73089' } },
    { ...base, rawData: { terminal: 'A0088080' } },
  ]
  assert.deepEqual(seriaisDasTransacoes(transacoes), ['PB1F248T73089', 'A0088080'])
})

test('serial repetido aparece uma vez só; sem serial não conta', () => {
  const transacoes: TransacaoCartao[] = [
    { ...base, rawData: { serial_number: 'PB0923AB76138' } },
    { ...base, rawData: { serial_number: 'PB0923AB76138' } },
    { ...base, rawData: { serial_number: null } },
    { ...base },
  ]
  assert.deepEqual(seriaisDasTransacoes(transacoes), ['PB0923AB76138'])
})

test('primeira execução não acusa nada — só registra', () => {
  const seriais = ['PB1F248T73089']
  assert.deepEqual(conflitosDeTerminal({}, 'sul-de-minas', seriais), [])
  assert.deepEqual(registrarTerminais({}, 'sul-de-minas', seriais), { 'PB1F248T73089': 'sul-de-minas' })
})

test('mesma maquininha no mesmo grupo segue sem conflito', () => {
  const registro = { 'PB1F248T73089': 'sul-de-minas' }
  assert.deepEqual(conflitosDeTerminal(registro, 'sul-de-minas', ['PB1F248T73089']), [])
})

test('maquininha já vista em outro grupo é conflito', () => {
  // O perfil de BH logado na conta do Sul de Minas: sem esta trava, a semana
  // inteira do Sul de Minas entraria carimbada como BH.
  const registro = { 'PB1F248T73089': 'sul-de-minas' }
  assert.deepEqual(
    conflitosDeTerminal(registro, 'bh', ['PB1F248T73089', 'A0088080']),
    [{ serial: 'PB1F248T73089', grupo: 'sul-de-minas' }],
  )
})
