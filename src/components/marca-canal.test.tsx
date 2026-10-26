import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarcaCanal, marcaDoCanal } from './marca-canal'

test('nomes de canal de marketing-canal viram a marca, inclusive comentário', () => {
  assert.equal(marcaDoCanal('Instagram'), 'instagram')
  assert.equal(marcaDoCanal('Instagram (comentário)'), 'instagram')
  assert.equal(marcaDoCanal('WhatsApp'), 'whatsapp')
  assert.equal(marcaDoCanal('Facebook (comentário)'), 'facebook')
  assert.equal(marcaDoCanal('Telegram'), 'telegram')
  assert.equal(marcaDoCanal('Indicação'), null)
  assert.equal(marcaDoCanal('Site'), null)
  // Cadastro livre: a marca vale como palavra em qualquer ponto; a primeira que aparece ganha.
  assert.equal(marcaDoCanal('Instagram-Ads'), 'instagram')
  assert.equal(marcaDoCanal('WhatsApp/Instagram'), 'whatsapp')
  assert.equal(marcaDoCanal('Anúncio no Facebook'), 'facebook')
  assert.equal(marcaDoCanal('Telegrama'), null)
})

test('logo sai na cor da marca pelo token, sem hex; canal sem marca usa ícone genérico', () => {
  const ig = renderToStaticMarkup(createElement(MarcaCanal, { canal: 'Instagram' }))
  assert.ok(ig.includes('fill-brand-instagram'))
  // Decorativo: o nome do canal está escrito ao lado.
  assert.ok(ig.includes('aria-hidden="true"'))
  assert.ok(!/#[0-9a-f]{6}/i.test(ig))
  const outro = renderToStaticMarkup(createElement(MarcaCanal, { canal: 'Indicação' }))
  assert.ok(outro.includes('lucide-message-circle'))
})
