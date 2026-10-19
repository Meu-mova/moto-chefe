import { test } from 'node:test'
import assert from 'node:assert/strict'
import { emailCobranca, emailVencimento } from './mensagens'

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

test('e-mail do vencimento avisa que vence hoje e quando bloqueia', () => {
  const e = emailVencimento({ responsavel: 'Bruno', grupo: 'Ecomoto Lavras', valor: 499, vencimento: '2027-04-14', link: null })
  assert.match(e.assunto, /vence hoje \(14\/04\/2027\)/)
  assert.match(e.texto, /R\$ 499,00/)
  assert.match(e.texto, /6º dia após o vencimento/)
})

test('e-mail do vencimento leva o link de pagamento quando existe', () => {
  const e = emailVencimento({ responsavel: 'Bruno', grupo: 'Ecomoto Lavras', valor: 499, vencimento: '2027-04-14', link: 'https://mp.test/x' })
  assert.match(e.texto, /https:\/\/mp\.test\/x/)
  assert.match(e.html, /href="https:\/\/mp\.test\/x"/)
})

test('sem link, o e-mail do vencimento manda pagar pelo aviso do MOVA', () => {
  const e = emailVencimento({ responsavel: null, grupo: 'G', valor: 499, vencimento: '2027-04-14', link: null })
  assert.match(e.texto, /aviso do topo/)
  assert.doesNotMatch(e.html, /href=/)
})
