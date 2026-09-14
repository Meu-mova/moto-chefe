import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  podeConsultar,
  proximoEstado,
  deveContinuarDrenando,
  ESPERA_APOS_VAZIO_MS,
  TETO_ITERACOES_DRENAGEM,
  ORCAMENTO_DRENAGEM_MS,
} from './nsu'

const AGORA = new Date('2026-09-14T12:00:00.000Z')

// Estado guardado "neutro", pra testes que não estão exercitando a
// normalização em si — só o que `proximoEstado` decide sobre a trava.
const SEM_ESTADO = { ultNSU: '0', maxNSU: '0' }

// cStat 137 = "nenhum documento localizado". Consultar de novo antes de 1 hora
// devolve 656 (consumo indevido) e a SEFAZ BLOQUEIA o CNPJ. É a regra que não
// pode ser furada por caminho nenhum.
test('depois de "nenhum documento", só pode consultar daqui a 1 hora', () => {
  const estado = proximoEstado({ cStat: 137, ultNSU: '000000000000120', maxNSU: '000000000000120' }, AGORA, SEM_ESTADO)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
  assert.equal(ESPERA_APOS_VAZIO_MS, 60 * 60 * 1000)
})

// Enquanto ultNSU < maxNSU ainda tem documento na fila: pode emendar a próxima
// consulta sem esperar, senão esvaziar um backlog de 90 dias levaria dias.
test('com documento na fila, pode emendar a próxima consulta', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '000000000000050', maxNSU: '000000000000120' }, AGORA, SEM_ESTADO)
  assert.equal(estado.proximaConsultaEm, null)
  assert.equal(estado.ultNSU, '000000000000050')
})

// Alcançou o fim da fila: mesmo com cStat 138, não há mais o que buscar.
test('quando ultNSU alcança maxNSU, espera a hora mesmo com cStat 138', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '000000000000120', maxNSU: '000000000000120' }, AGORA, SEM_ESTADO)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
})

// 656 é o bloqueio já acontecendo. Insistir piora. E como não veio ultNSU
// nenhum, o normalizado tem que ser o que já estava guardado — nunca o vazio
// bruto, que reabriria a fila inteira na consulta seguinte.
test('consumo indevido (656) também segura por 1 hora e preserva o NSU já guardado', () => {
  const estado = proximoEstado({ cStat: 656, ultNSU: '', maxNSU: '' }, AGORA, { ultNSU: '000000000000090', maxNSU: '000000000000120' })
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
  assert.equal(estado.ultNSU, '000000000000090', 'não inventa NSU quando a SEFAZ não devolveu — mantém o guardado')
  assert.equal(estado.maxNSU, '000000000000120')
})

// Falha fechado: NSU ausente/não numérico nunca pode virar "0 < maxNSU" e
// liberar consulta imediata — isso seria o mesmo caminho perigoso do 656.
test('cStat 138 com ultNSU vazio segura 1 hora (não trata ausência como zero)', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '', maxNSU: '000000000000120' }, AGORA, SEM_ESTADO)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
})

test('cStat 138 com ultNSU não numérico segura 1 hora', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: 'abc', maxNSU: '000000000000120' }, AGORA, SEM_ESTADO)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
})

test('cStat 138 com maxNSU vazio segura 1 hora', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '000000000000050', maxNSU: '' }, AGORA, SEM_ESTADO)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
})

// Number(' ') é 0 em JavaScript — só espaço em branco é ausência disfarçada,
// mesmo buraco do vazio/lixo, só com outro caractere.
test('cStat 138 com ultNSU só espaço em branco segura 1 hora', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: ' ', maxNSU: '000000000000120' }, AGORA, SEM_ESTADO)
  assert.equal(estado.proximaConsultaEm?.getTime(), AGORA.getTime() + ESPERA_APOS_VAZIO_MS)
})

// O normalizado também precisa tratar "só espaço" como ausência — não é só a
// decisão da trava (acima). Antes desta task o valor DEVOLVIDO era o bruto, e
// ' ' é truthy em JS: sobrevivia ao `||` de sincronizar.ts e virava '0' no
// envelope da consulta seguinte, reabrindo a fila inteira.
test('NSU só de espaço normaliza para o guardado, não para o espaço', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: ' ', maxNSU: '000000000000120' }, AGORA, { ultNSU: '000000000000090', maxNSU: '000000000000090' })
  assert.equal(estado.ultNSU, '000000000000090')
})

// Retrocesso: um NSU bruto numericamente MENOR que o guardado não pode "voltar
// no tempo" a leitura e reabrir NSU que já foi processado.
test('NSU menor que o guardado não retrocede — mantém o guardado', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '000000000000030', maxNSU: '000000000000120' }, AGORA, { ultNSU: '000000000000090', maxNSU: '000000000000090' })
  assert.equal(estado.ultNSU, '000000000000090')
})

// Caso bom continua emendando sem esperar — a defesa acima não pode travar
// o caminho normal de esvaziar a fila.
test('com ultNSU e maxNSU válidos e ultNSU < maxNSU, continua emendando sem esperar', () => {
  const estado = proximoEstado({ cStat: 138, ultNSU: '000000000000050', maxNSU: '000000000000120' }, AGORA, SEM_ESTADO)
  assert.equal(estado.proximaConsultaEm, null)
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

// --- deveContinuarDrenando ---------------------------------------------
//
// CRITICAL: guarda de progresso do laço de drenagem. Sem isso, o cStat 656
// de hoje (CNPJ suspenso) se repete: `aindaTemFila` calculado no bruto
// (dentro de `proximoEstado`) pode ficar `true` pra sempre enquanto o NSU
// normalizado devolvido não muda — daí o laço martela a mesma consulta.

test('fila zerou: pára, mesmo se o NSU não avançou (cStat 137 legítimo não move o NSU)', () => {
  const decisao = deveContinuarDrenando({ filaZerou: true, nsuAvancou: false, iteracao: 0, decorridoMs: 100 })
  assert.deepEqual(decisao, { continuar: false, motivo: 'fila_zerou' })
})

test('sem progresso: pára mesmo com fila "parecendo" cheia, iteração e tempo dentro do limite', () => {
  const decisao = deveContinuarDrenando({ filaZerou: false, nsuAvancou: false, iteracao: 3, decorridoMs: 5_000 })
  assert.deepEqual(decisao, { continuar: false, motivo: 'sem_progresso' })
})

test('teto de iterações: pára na última iteração permitida, mesmo com progresso e tempo sobrando', () => {
  const decisao = deveContinuarDrenando({
    filaZerou: false,
    nsuAvancou: true,
    iteracao: TETO_ITERACOES_DRENAGEM - 1,
    decorridoMs: 100,
  })
  assert.deepEqual(decisao, { continuar: false, motivo: 'teto' })
})

test('orçamento de tempo: pára quando o tempo decorrido bate o orçamento, mesmo com progresso e iteração baixa', () => {
  const decisao = deveContinuarDrenando({
    filaZerou: false,
    nsuAvancou: true,
    iteracao: 1,
    decorridoMs: ORCAMENTO_DRENAGEM_MS,
  })
  assert.deepEqual(decisao, { continuar: false, motivo: 'tempo' })
})

test('continua: fila não zerou, NSU avançou, iteração e tempo dentro do limite', () => {
  const decisao = deveContinuarDrenando({ filaZerou: false, nsuAvancou: true, iteracao: 0, decorridoMs: 0 })
  assert.deepEqual(decisao, { continuar: true, motivo: null })
})
