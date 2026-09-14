import { test } from 'node:test'
import assert from 'node:assert/strict'
import { podeConsultar, proximoEstado, ESPERA_APOS_VAZIO_MS } from './nsu'

const AGORA = new Date('2026-09-14T12:00:00.000Z')

// cStat 137 = "nenhum documento localizado". Consultar de novo antes de 1 hora
// devolve 656 (consumo indevido) e a SEFAZ BLOQUEIA o CNPJ. É a regra que não
// pode ser furada por caminho nenhum.
test('depois de "nenhum documento", só pode consultar daqui a 1 hora', () => {
  const estado = proximoEstado({ cStat: 137, ultNSU: '000000000000120', maxNSU: '000000000000120' }, AGORA)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
  assert.equal(ESPERA_APOS_VAZIO_MS, 60 * 60 * 1000)
})

// Enquanto ultNSU < maxNSU ainda tem documento na fila: pode emendar a próxima
// consulta sem esperar, senão esvaziar um backlog de 90 dias levaria dias.
test('com documento na fila, pode emendar a próxima consulta', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '000000000000050', maxNSU: '000000000000120' }, AGORA)
  assert.equal(estado.proximaConsultaEm, null)
  assert.equal(estado.ultNSU, '000000000000050')
})

// Alcançou o fim da fila: mesmo com cStat 138, não há mais o que buscar.
test('quando ultNSU alcança maxNSU, espera a hora mesmo com cStat 138', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '000000000000120', maxNSU: '000000000000120' }, AGORA)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
})

// 656 é o bloqueio já acontecendo. Insistir piora.
test('consumo indevido (656) também segura por 1 hora e preserva o NSU', () => {
  const estado = proximoEstado({ cStat: 656, ultNSU: '', maxNSU: '' }, AGORA)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
  assert.equal(estado.ultNSU, '', 'não inventa NSU quando a SEFAZ não devolveu')
})

test('sem trava gravada, pode consultar', () => {
  assert.equal(podeConsultar({ proximaConsultaEm: null }, AGORA), true)
})

test('antes da hora marcada, não pode', () => {
  const daquiMeiaHora = new Date(AGORA.getTime() + 30 * 60 * 1000)
  assert.equal(podeConsultar({ proximaConsultaEm: daquiMeiaHora }, AGORA), false)
})

test('na hora marcada, pode', () => {
  assert.equal(podeConsultar({ proximaConsultaEm: AGORA }, AGORA), true)
})
