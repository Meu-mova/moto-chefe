import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp, { type Color } from 'sharp'
import { montarImagemDanfe } from './logo'
import type { EmitenteDanfe } from './emitente-danfe'

const PRETO = { r: 0, g: 0, b: 0, alpha: 1 }
const TRANSPARENTE = { r: 0, g: 0, b: 0, alpha: 0 }
const ERRO_LEITURA = 'Não deu para ler a imagem. Confira o arquivo e envie de novo.'

const emitente: EmitenteDanfe = {
  razaoSocial: 'ECO-WHEELS MOBILIDADE E DIVERSAO LTDA', logradouro: 'Avenida Exemplo', numero: '1000',
  complemento: null, bairro: 'Centro', cep: '78000000', cidade: 'Cuiabá', uf: 'MT', cnpj: '49366097000140',
  telefone: '6533330000', email: 'contato@exemplo.com.br', site: 'www.exemplo.com.br',
}

/** Desenho preto de `w`x`h` no meio de uma tela `lado`x`lado` com margem. */
async function comMargem(w: number, h: number, lado: number, fundo: Color, formato: 'png' | 'jpeg' = 'png') {
  const desenho = await sharp({ create: { width: w, height: h, channels: 4, background: PRETO } }).png().toBuffer()
  return sharp({ create: { width: lado, height: lado, channels: 4, background: fundo } })
    .composite([{ input: desenho, gravity: 'center' }])[formato]().toBuffer()
}

/** Quantos pixels escuros há na faixa de colunas [de, ate) da imagem. */
async function escurosEntre(png: Buffer, de: number, ate: number) {
  const { data, info } = await sharp(png).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true })
  let n = 0
  for (let y = 0; y < info.height; y++) for (let x = de; x < ate; x++) if (data[y * info.width + x] < 100) n++
  return n
}

test('sai 976x316 (a proporção da caixa da NG), sem nenhum pixel transparente', async () => {
  const r = await montarImagemDanfe(await comMargem(300, 300, 1200, TRANSPARENTE), emitente)
  assert.ok(r.ok)
  const { data, info } = await sharp(r.png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  assert.equal(info.width, 976)
  assert.equal(info.height, 316)
  let menorAlfa = 255
  for (let i = 3; i < data.length; i += 4) menorAlfa = Math.min(menorAlfa, data[i])
  assert.equal(menorAlfa, 255)
})

test('a logo fica à esquerda e o texto do emitente à direita', async () => {
  const r = await montarImagemDanfe(await comMargem(300, 300, 1200, TRANSPARENTE), emitente)
  assert.ok(r.ok)
  assert.ok((await escurosEntre(r.png, 0, 260)) > 5000, 'logo na faixa da esquerda')
  assert.ok((await escurosEntre(r.png, 400, 976)) > 1000, 'texto na faixa da direita')
})

test('a margem da logo é recortada: a logo ocupa a altura da faixa, não um canto', async () => {
  const pequena = await montarImagemDanfe(await comMargem(100, 100, 1200, { r: 255, g: 255, b: 255, alpha: 1 }, 'jpeg'), emitente)
  assert.ok(pequena.ok)
  assert.ok((await escurosEntre(pequena.png, 0, 260)) > 20000, 'desenho de 100px ampliado, não perdido na margem')
})

test('texto com < e & é desenhado, sem quebrar a imagem', async () => {
  const r = await montarImagemDanfe(await comMargem(300, 300, 1200, TRANSPARENTE), { ...emitente, razaoSocial: 'A & B <Comércio>', site: 'x.com/?a=1&b=<2>' })
  assert.ok(r.ok)
})

test('logo comum fica bem abaixo de 64 KB e informa o tamanho em KB', async () => {
  const r = await montarImagemDanfe(await comMargem(300, 300, 1200, TRANSPARENTE), emitente)
  assert.ok(r.ok)
  assert.ok(r.kb > 0 && r.kb < 64, `kb=${r.kb}`)
})

test('recusa arquivo acima de 5 MB', async () => {
  assert.deepEqual(await montarImagemDanfe(Buffer.alloc(5 * 1024 * 1024 + 1), emitente), { ok: false, erro: 'A imagem passa de 5 MB. Envie um arquivo menor.' })
})

test('recusa imagem que não é PNG nem JPG, mesmo com nome .png', async () => {
  const webp = await sharp({ create: { width: 50, height: 50, channels: 4, background: PRETO } }).webp().toBuffer()
  assert.deepEqual(await montarImagemDanfe(webp, emitente), { ok: false, erro: 'Envie a logo em PNG ou JPG.' })
})

test('recusa arquivo que não é imagem', async () => {
  assert.deepEqual(await montarImagemDanfe(Buffer.from('não sou imagem'), emitente), { ok: false, erro: 'Envie a logo em PNG ou JPG.' })
})

test('PNG cortado no meio do arquivo recusa com frase, sem lançar', async () => {
  const inteiro = await comMargem(300, 300, 1200, TRANSPARENTE)
  assert.deepEqual(await montarImagemDanfe(inteiro.subarray(0, Math.floor(inteiro.length / 2)), emitente), { ok: false, erro: ERRO_LEITURA })
})

test('imagem toda de uma cor só recusa com frase, sem lançar', async () => {
  const branca = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).png().toBuffer()
  assert.deepEqual(await montarImagemDanfe(branca, emitente), { ok: false, erro: ERRO_LEITURA })
})

test('logo cheia de detalhes (ruído colorido) ainda sai com até 64 KB, com menos cores', async () => {
  const ruido = Buffer.alloc(800 * 800 * 3)
  for (let i = 0; i < ruido.length; i++) ruido[i] = Math.floor(Math.random() * 256)
  const entrada = await sharp(ruido, { raw: { width: 800, height: 800, channels: 3 } }).png().toBuffer()
  const r = await montarImagemDanfe(entrada, emitente)
  assert.ok(r.ok)
  assert.ok(r.png.length <= 64 * 1024, `bytes=${r.png.length}`)
})
