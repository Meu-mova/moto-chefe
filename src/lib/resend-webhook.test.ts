import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { verificarAssinaturaResend, parseEventoResend, eventoIndicaFalha } from './resend-webhook'

// Gera uma assinatura Svix válida, como o Resend faria.
function assinar(secret: string, id: string, ts: string, body: string): string {
  const bytes = Buffer.from(secret.replace(/^whsec_/, ''), 'base64')
  const sig = createHmac('sha256', bytes).update(`${id}.${ts}.${body}`).digest('base64')
  return `v1,${sig}`
}

const SECRET = 'whsec_' + Buffer.from('segredo-de-teste-1234567890').toString('base64')

test('aceita assinatura válida', () => {
  const id = 'msg_1', ts = '1700000000', body = '{"type":"email.bounced"}'
  const header = assinar(SECRET, id, ts, body)
  assert.equal(verificarAssinaturaResend(SECRET, id, ts, body, header), true)
})

test('rejeita assinatura adulterada (corpo trocado)', () => {
  const id = 'msg_1', ts = '1700000000'
  const header = assinar(SECRET, id, ts, '{"type":"email.bounced"}')
  assert.equal(verificarAssinaturaResend(SECRET, id, ts, '{"type":"email.delivered"}', header), false)
})

test('rejeita cabeçalhos vazios', () => {
  assert.equal(verificarAssinaturaResend(SECRET, '', '', '', ''), false)
})

test('parse extrai tipo, email_id, destinatário e motivo do bounce', () => {
  const ev = parseEventoResend({
    type: 'email.bounced',
    data: { email_id: 'e_123', to: ['cliente@gmail.com'], bounce: { message: 'mailbox does not exist' } },
  })
  assert.deepEqual(ev, { tipo: 'email.bounced', emailId: 'e_123', to: 'cliente@gmail.com', motivo: 'mailbox does not exist' })
})

test('parse devolve null sem type', () => {
  assert.equal(parseEventoResend({ data: {} }), null)
})

test('só bounce/complaint indicam falha', () => {
  assert.equal(eventoIndicaFalha('email.bounced'), true)
  assert.equal(eventoIndicaFalha('email.complained'), true)
  assert.equal(eventoIndicaFalha('email.delivered'), false)
  assert.equal(eventoIndicaFalha('email.sent'), false)
})
