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
})

test('logo sai na cor da marca pelo token, sem hex; canal sem marca usa ícone genérico', () => {
  const ig = renderToStaticMarkup(createElement(MarcaCanal, { canal: 'Instagram' }))
  assert.ok(ig.includes('fill-brand-instagram'))
  assert.ok(ig.includes('aria-label="Instagram"'))
  assert.ok(!/#[0-9a-f]{6}/i.test(ig))
  const outro = renderToStaticMarkup(createElement(MarcaCanal, { canal: 'Indicação' }))
  assert.ok(outro.includes('lucide-message-circle'))
})
