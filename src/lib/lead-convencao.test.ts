import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  leadSchema, waLink, emailConfirmacaoLead, emailNotificacaoEquipe, MEET,
} from './lead-convencao'

test('leadSchema aceita um lead válido', () => {
  const r = leadSchema.safeParse({
    nome: 'Fulano de Tal', email: 'fulano@loja.com', whatsapp: '35999998888', unidade: 'Poços de Caldas',
  })
  assert.equal(r.success, true)
})

test('leadSchema rejeita e-mail inválido e campos vazios', () => {
  assert.equal(leadSchema.safeParse({ nome: 'F', email: 'x', whatsapp: '', unidade: '' }).success, false)
  assert.equal(leadSchema.safeParse({ nome: 'Fulano', email: 'a@b.com', whatsapp: '35999998888', unidade: 'X' }).success, false)
})

test('leadSchema faz trim', () => {
  const r = leadSchema.safeParse({ nome: '  Ana  ', email: ' ana@x.com ', whatsapp: ' 35988887777 ', unidade: ' Varginha ' })
  assert.equal(r.success, true)
  if (r.success) assert.equal(r.data.nome, 'Ana')
})

test('waLink codifica número e mensagem', () => {
  const l = waLink('5535991702105', 'Estarei na reunião pra conhecer mais do MOVA')
  assert.match(l, /^https:\/\/wa\.me\/5535991702105\?text=/)
  assert.match(l, /Estarei%20na%20reuni%C3%A3o/)
})

test('e-mail ao lead traz o link do meet e a data', () => {
  const { assunto, texto } = emailConfirmacaoLead('Carlos Souza')
  assert.match(assunto, /vaga/i)
  assert.match(texto, /Carlos/)
  assert.ok(texto.includes(MEET.link))
  assert.ok(texto.includes(MEET.quando))
})

test('e-mail à equipe traz os dados do lead', () => {
  const { assunto, texto } = emailNotificacaoEquipe({
    nome: 'Ana Lima', email: 'ana@x.com', whatsapp: '35988887777', unidade: 'Lavras',
  })
  assert.match(assunto, /Ana Lima/)
  assert.match(assunto, /Lavras/)
  assert.match(texto, /ana@x\.com/)
  assert.match(texto, /35988887777/)
})
