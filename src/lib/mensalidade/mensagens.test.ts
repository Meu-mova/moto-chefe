import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailCobranca } from './mensagens'

const BASE = { responsavel: 'Bruno', grupo: 'Ecomoto Lavras', valor: 1498, vencimento: '2027-04-14', link: 'https://mp.test/x' }

test('e-mail traz valor, vencimento e link', () => {
  const e = emailCobranca(BASE)
  assert.match(e.assunto, /R\$ 1\.498,00, vence em 14\/04\/2027/)
  assert.match(e.texto, /https:\/\/mp\.test\/x/)
  assert.match(e.html, /href="https:\/\/mp\.test\/x"/)
})

test('nome do grupo vem escapado no HTML', () => {
  assert.match(emailCobranca({ ...BASE, grupo: 'A & <b>' }).html, /A &amp; &lt;b&gt;/)
})
