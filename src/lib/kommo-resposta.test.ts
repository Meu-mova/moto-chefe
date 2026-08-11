import { test } from 'node:test'
import assert from 'node:assert/strict'
import { estadoRespostaDoLead, AUTO_RESPOSTA_SEG } from './kommo-resposta'

const t0 = 1_786_000_000
const ent = (dt: number) => ({ type: 'incoming_chat_message', created_by: 0, created_at: t0 + dt })
const sai = (dt: number, by = 0) => ({ type: 'outgoing_chat_message', created_by: by, created_at: t0 + dt })

test('ignora a auto-resposta e conta a próxima saída', () => {
  const r = estadoRespostaDoLead([ent(0), sai(3), sai(600)])
  assert.equal(r.leadIn, t0)
  assert.equal(r.leadResp, t0 + 600)
})

test('saída sem autor conta como resposta (vendedor respondendo pelo WhatsApp)', () => {
  const r = estadoRespostaDoLead([ent(0), sai(1800, 0)])
  assert.equal(r.leadResp, t0 + 1800)
})

test('só a auto-resposta = lead sem resposta', () => {
  const r = estadoRespostaDoLead([ent(0), sai(5)])
  assert.equal(r.leadIn, t0)
  assert.equal(r.leadResp, null)
})

test('nenhuma saída = lead sem resposta', () => {
  assert.equal(estadoRespostaDoLead([ent(0), ent(90)]).leadResp, null)
})

test('exatamente no corte já conta', () => {
  assert.equal(estadoRespostaDoLead([ent(0), sai(AUTO_RESPOSTA_SEG)]).leadResp, t0 + AUTO_RESPOSTA_SEG)
  assert.equal(estadoRespostaDoLead([ent(0), sai(AUTO_RESPOSTA_SEG - 1)]).leadResp, null)
})

test('saída antes de o cliente falar não é resposta', () => {
  const r = estadoRespostaDoLead([sai(0), ent(100), sai(1000)])
  assert.equal(r.leadIn, t0 + 100)
  assert.equal(r.leadResp, t0 + 1000)
})

test('guarda o PRIMEIRO contato e a PRIMEIRA resposta válida, não os últimos', () => {
  const r = estadoRespostaDoLead([ent(0), sai(500), ent(9000), sai(9500)])
  assert.equal(r.leadIn, t0)
  assert.equal(r.leadResp, t0 + 500)
})

test('não depende da ordem em que os eventos chegam', () => {
  const baguncado = [sai(600), ent(0), sai(3)]
  assert.deepEqual(estadoRespostaDoLead(baguncado), { leadIn: t0, leadResp: t0 + 600 })
})

test('não muta o array recebido', () => {
  const evs = [sai(600), ent(0)]
  estadoRespostaDoLead(evs)
  assert.equal(evs[0].created_at, t0 + 600)
})

test('lead sem nenhum contato do cliente fica fora do cálculo', () => {
  assert.deepEqual(estadoRespostaDoLead([sai(0), sai(900)]), { leadIn: null, leadResp: null })
})
