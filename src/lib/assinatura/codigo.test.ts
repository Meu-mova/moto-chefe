import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  gerarCodigo, hashCodigo, validarCodigo, codigoAindaVale, podeEnviarCodigo,
  MAX_TENTATIVAS, MAX_CODIGOS, COOLDOWN_SEGUNDOS, type EstadoCodigo,
} from './codigo'

const DOC = 'doc-1'
const AGORA = new Date('2026-08-11T14:00:00.000Z')
const estado = (over: Partial<EstadoCodigo> = {}): EstadoCodigo => ({
  codigoHash: hashCodigo('123456', DOC),
  expiraEm: new Date('2026-08-11T14:10:00.000Z'),
  tentativas: 0,
  usadoEm: null,
  ...over,
})

test('gerarCodigo devolve 6 dígitos', () => {
  for (let i = 0; i < 50; i++) assert.match(gerarCodigo(), /^\d{6}$/)
})

test('hash do mesmo código em documentos diferentes não colide', () => {
  assert.notEqual(hashCodigo('123456', 'doc-1'), hashCodigo('123456', 'doc-2'))
})

test('código correto e no prazo é aceito', () => {
  assert.equal(validarCodigo(estado(), '123456', DOC, AGORA), 'ok')
})

test('código errado é recusado', () => {
  assert.equal(validarCodigo(estado(), '000000', DOC, AGORA), 'incorreto')
})

test('código expirado é recusado mesmo estando correto', () => {
  const depois = new Date('2026-08-11T14:11:00.000Z')
  assert.equal(validarCodigo(estado(), '123456', DOC, depois), 'expirado')
})

test('código já usado não revalida', () => {
  assert.equal(validarCodigo(estado({ usadoEm: AGORA }), '123456', DOC, AGORA), 'usado')
})

test('estoura ao atingir o limite de tentativas', () => {
  assert.equal(validarCodigo(estado({ tentativas: MAX_TENTATIVAS }), '123456', DOC, AGORA), 'excedeu')
})

test('na última tentativa permitida ainda valida', () => {
  assert.equal(validarCodigo(estado({ tentativas: MAX_TENTATIVAS - 1 }), '123456', DOC, AGORA), 'ok')
})

// Regressão do erro relatado em 11/08: o cliente sai para o WhatsApp buscar o
// código, e voltar recarrega a página no celular. Se aí o sistema gerar um
// código novo, o que ele acabou de copiar deixa de valer e a assinatura falha.
test('código no prazo e sem uso continua valendo — não se gera outro', () => {
  assert.equal(codigoAindaVale(estado(), AGORA), true)
})

test('código usado, expirado ou estourado não vale mais', () => {
  assert.equal(codigoAindaVale(estado({ usadoEm: AGORA }), AGORA), false)
  assert.equal(codigoAindaVale(estado(), new Date('2026-08-11T14:11:00.000Z')), false)
  assert.equal(codigoAindaVale(estado({ tentativas: MAX_TENTATIVAS }), AGORA), false)
})

test('sem código nenhum, precisa gerar', () => {
  assert.equal(codigoAindaVale(null, AGORA), false)
  assert.equal(codigoAindaVale(undefined, AGORA), false)
})

// ─── Trava de reenvio ────────────────────────────────────────────────────────
// Caso real de 21/08: 42 pedidos de código em 63 minutos para o mesmo endereço,
// quatro deles em 10 segundos, e nenhuma tentativa de digitar código — o e-mail
// não chegava. Cada clique invalida o código anterior, então mesmo um e-mail
// atrasado chegava com o código já morto. E rajada assim contra a Microsoft é o
// que faz o provedor limitar o domínio inteiro, estragando a entrega dos outros.

test('primeiro envio do documento passa', () => {
  assert.deepEqual(podeEnviarCodigo({ enviados: 0, ultimoEnvioEm: null }, AGORA), { ok: true })
})

test('dentro do cooldown recusa e diz quantos segundos faltam', () => {
  const ha20s = new Date(AGORA.getTime() - 20_000)
  assert.deepEqual(
    podeEnviarCodigo({ enviados: 1, ultimoEnvioEm: ha20s }, AGORA),
    { ok: false, motivo: 'aguarde', segundos: COOLDOWN_SEGUNDOS - 20 },
  )
})

test('no instante exato do cooldown já libera', () => {
  const ha60s = new Date(AGORA.getTime() - COOLDOWN_SEGUNDOS * 1000)
  assert.deepEqual(podeEnviarCodigo({ enviados: 1, ultimoEnvioEm: ha60s }, AGORA), { ok: true })
})

test('passado o cooldown, libera', () => {
  const ha90s = new Date(AGORA.getTime() - 90_000)
  assert.deepEqual(podeEnviarCodigo({ enviados: 3, ultimoEnvioEm: ha90s }, AGORA), { ok: true })
})

test('no teto recusa mesmo com o cooldown vencido', () => {
  const ontem = new Date(AGORA.getTime() - 86_400_000)
  assert.deepEqual(
    podeEnviarCodigo({ enviados: MAX_CODIGOS, ultimoEnvioEm: ontem }, AGORA),
    { ok: false, motivo: 'excedeu' },
  )
})

test('o teto vence o cooldown — quem estourou não recebe "aguarde"', () => {
  // Senão a tela promete uma espera de 60s que nunca vai liberar nada.
  const ha10s = new Date(AGORA.getTime() - 10_000)
  assert.deepEqual(
    podeEnviarCodigo({ enviados: MAX_CODIGOS + 37, ultimoEnvioEm: ha10s }, AGORA),
    { ok: false, motivo: 'excedeu' },
  )
})

test('o último envio permitido ainda passa', () => {
  const ontem = new Date(AGORA.getTime() - 86_400_000)
  assert.deepEqual(podeEnviarCodigo({ enviados: MAX_CODIGOS - 1, ultimoEnvioEm: ontem }, AGORA), { ok: true })
})

test('o primeiro código automático conta na cota — o teto é de e-mails, não de cliques', () => {
  assert.equal(MAX_CODIGOS, 5)
  const ontem = new Date(AGORA.getTime() - 86_400_000)
  assert.equal(podeEnviarCodigo({ enviados: 5, ultimoEnvioEm: ontem }, AGORA).ok, false)
})

test('contador zerado com envio antigo registrado não trava', () => {
  // Documento novo criado pela loja: token novo, contador zerado. É a saída de
  // quem bateu no teto, então não pode herdar trava de lugar nenhum.
  assert.deepEqual(podeEnviarCodigo({ enviados: 0, ultimoEnvioEm: null }, AGORA), { ok: true })
})
