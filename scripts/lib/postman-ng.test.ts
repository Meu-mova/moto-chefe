import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mascararTrechos, varrerArquivo } from './postman-ng'

const TOKEN = 'tok3n-super-secreto-123'
const EMPRESA = '9f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8'

test('segredo inteiro vira ****, quantas vezes aparecer', () => {
  assert.deepEqual(
    mascararTrechos(`GET /v2/empresas/${EMPRESA}/nfe Basic ${TOKEN} de novo ${EMPRESA}`, [TOKEN, EMPRESA]),
    { texto: 'GET /v2/empresas/****/nfe Basic **** de novo ****', trechos: 3 },
  )
})

test('pedaço de 8 caracteres ou mais de um segredo vira ****, em qualquer formato de linha', () => {
  // Pedaços como o Postman deixa ao quebrar a linha: fim de uma, começo recuado da outra.
  for (const linha of [
    `  GET https://api/v2/empresas/${EMPRESA.slice(0, 13)}`,
    `  | ${EMPRESA.slice(13)}/pdf","link`,
    `\x1b[90m│ ${EMPRESA.slice(5, 30)}\x1b[39m\r`,
    `r/file/${EMPRESA.slice(10, 18)}/`,
  ]) {
    const { texto, trechos } = mascararTrechos(linha, [EMPRESA])
    assert.equal(trechos, 1, linha)
    assert.ok(texto.includes('****'), texto)
    for (let i = 0; i + 8 <= EMPRESA.length; i++) assert.ok(!texto.includes(EMPRESA.slice(i, i + 8)), texto)
  }
})

test('pedaço de até 7 caracteres fica: não dá para distinguir de texto comum', () => {
  assert.deepEqual(mascararTrechos(`fim ${EMPRESA.slice(0, 7)}`, [EMPRESA]), { texto: `fim ${EMPRESA.slice(0, 7)}`, trechos: 0 })
})

test('linha sem segredo sai igual e sem trecho contado', () => {
  assert.deepEqual(mascararTrechos('POST /v2/empresas/****/nf-e [200 OK]', [TOKEN, EMPRESA]), { texto: 'POST /v2/empresas/****/nf-e [200 OK]', trechos: 0 })
})

test('varrerArquivo reescreve mascarado (0600) e conta os trechos', () => {
  const arq = join(mkdtempSync(join(tmpdir(), 'postman-ng-')), 'x.log')
  writeFileSync(arq, `a ${EMPRESA.slice(0, 20)}\n  | ${EMPRESA.slice(20)} b\nsem nada\n`, { mode: 0o644 })
  assert.equal(varrerArquivo(arq, [TOKEN, EMPRESA]), 2)
  assert.equal(readFileSync(arq, 'utf8'), 'a ****\n  | **** b\nsem nada\n')
  assert.equal(statSync(arq).mode & 0o777, 0o600)
})

test('varrerArquivo em log limpo não mexe no arquivo', () => {
  const arq = join(mkdtempSync(join(tmpdir(), 'postman-ng-')), 'x.log')
  writeFileSync(arq, 'limpo ****\n', { mode: 0o600 })
  const antes = statSync(arq).mtimeMs
  assert.equal(varrerArquivo(arq, [EMPRESA]), 0)
  assert.equal(statSync(arq).mtimeMs, antes)
})
