import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp, { type Color } from 'sharp'
import { ajustarLogo } from './logo'

const PRETO = { r: 0, g: 0, b: 0, alpha: 1 }

/** Desenho preto de `w`x`h` no meio de uma tela `lado`x`lado` com margem. */
async function comMargem(w: number, h: number, lado: number, fundo: Color, formato: 'png' | 'jpeg' = 'png') {
  const desenho = await sharp({ create: { width: w, height: h, channels: 4, background: PRETO } }).png().toBuffer()
  return sharp({ create: { width: lado, height: lado, channels: 4, background: fundo } })
    .composite([{ input: desenho, gravity: 'center' }])[formato]().toBuffer()
}

/** Caixa do que não é transparente na imagem gerada. */
async function caixaDoDesenho(png: Buffer) {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  let top = info.height, bottom = -1, left = info.width, right = -1
  for (let y = 0; y < info.height; y++) for (let x = 0; x < info.width; x++) {
    if (data[(y * info.width + x) * 4 + 3] > 8) {
      top = Math.min(top, y); bottom = Math.max(bottom, y); left = Math.min(left, x); right = Math.max(right, x)
    }
  }
  return { info, top, bottom, left, right }
}

test('logo quadrada com margem transparente sai 340x120 com o desenho de cima a baixo, centralizado', async () => {
  const r = await ajustarLogo(await comMargem(300, 300, 1200, { r: 0, g: 0, b: 0, alpha: 0 }))
  assert.ok(r.ok)
  const c = await caixaDoDesenho(r.png)
  assert.equal(c.info.width, 340)
  assert.equal(c.info.height, 120)
  assert.equal(c.top, 0)
  assert.equal(c.bottom, 119)
  // 120x120 no meio de 340: sobra 110 de cada lado
  assert.ok(Math.abs(c.left - 110) <= 1, `left=${c.left}`)
  assert.ok(Math.abs(c.right - 229) <= 1, `right=${c.right}`)
})

test('JPG com margem branca também é recortado e o branco de fundo vira transparente', async () => {
  const r = await ajustarLogo(await comMargem(300, 300, 1200, { r: 255, g: 255, b: 255, alpha: 1 }, 'jpeg'))
  assert.ok(r.ok)
  const c = await caixaDoDesenho(r.png)
  assert.equal(c.top, 0)
  assert.equal(c.bottom, 119)
  assert.ok(Math.abs(c.left - 110) <= 2, `left=${c.left}`)
})

test('desenho mais largo que 340x120 encosta nas laterais sem distorcer', async () => {
  // 800x100 (8:1) cabe em 340 de largura com 42,5 de altura
  const r = await ajustarLogo(await comMargem(800, 100, 1200, { r: 0, g: 0, b: 0, alpha: 0 }))
  assert.ok(r.ok)
  const c = await caixaDoDesenho(r.png)
  assert.equal(c.left, 0)
  assert.equal(c.right, 339)
  const altura = c.bottom - c.top + 1
  assert.ok(Math.abs(altura - 42.5) <= 1.5, `altura=${altura}`)
})

test('recusa arquivo acima de 5 MB', async () => {
  const r = await ajustarLogo(Buffer.alloc(5 * 1024 * 1024 + 1))
  assert.deepEqual(r, { ok: false, erro: 'A imagem passa de 5 MB. Envie um arquivo menor.' })
})

test('recusa imagem que não é PNG nem JPG, mesmo com nome .png', async () => {
  const webp = await sharp({ create: { width: 50, height: 50, channels: 4, background: PRETO } }).webp().toBuffer()
  const r = await ajustarLogo(webp)
  assert.deepEqual(r, { ok: false, erro: 'Envie a logo em PNG ou JPG.' })
})

test('recusa arquivo que não é imagem', async () => {
  const r = await ajustarLogo(Buffer.from('não sou imagem'))
  assert.deepEqual(r, { ok: false, erro: 'Envie a logo em PNG ou JPG.' })
})

test('recusa quando a logo ajustada passa de 64 KB', async () => {
  // Ruído aleatório opaco: o PNG 340x120 não comprime e fica acima de 64 KB.
  const ruido = Buffer.alloc(680 * 240 * 3)
  for (let i = 0; i < ruido.length; i++) ruido[i] = Math.floor(Math.random() * 256)
  const entrada = await sharp(ruido, { raw: { width: 680, height: 240, channels: 3 } }).png().toBuffer()
  const r = await ajustarLogo(entrada)
  assert.deepEqual(r, { ok: false, erro: 'A logo ajustada passou de 64 KB. Use uma imagem mais simples, com menos detalhes.' })
})

test('logo comum fica bem abaixo de 64 KB e informa o tamanho em KB', async () => {
  const r = await ajustarLogo(await comMargem(300, 300, 1200, { r: 0, g: 0, b: 0, alpha: 0 }))
  assert.ok(r.ok)
  assert.ok(r.kb > 0 && r.kb < 64, `kb=${r.kb}`)
})
