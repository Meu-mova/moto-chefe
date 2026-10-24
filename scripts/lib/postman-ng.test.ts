import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarFiltroLinhas, mascararTexto } from './postman-ng'

const TOKEN = 'tok3n-super-secreto-123'
const EMPRESA = '9f1c2b3a-4d5e-6f70-8192-a3b4c5d6e7f8'

function filtrar(linhas: string[], segredos: string[]) {
  const saida: string[] = []
  const filtro = criarFiltroLinhas(segredos, l => saida.push(l))
  for (const l of linhas) filtro.linha(l)
  filtro.fim()
  return saida
}

test('mascararTexto troca cada segredo inteiro por ****', () => {
  assert.equal(
    mascararTexto(`GET /v2/empresas/${EMPRESA}/nfe Basic ${TOKEN} de novo ${EMPRESA}`, [TOKEN, EMPRESA]),
    'GET /v2/empresas/****/nfe Basic **** de novo ****',
  )
})

test('filtro devolve as mesmas linhas, na ordem, com o segredo inteiro mascarado', () => {
  assert.deepEqual(filtrar(['a', `url /empresas/${EMPRESA}/x`, 'b'], [EMPRESA]), ['a', 'url /empresas/****/x', 'b'])
})

test('segredo partido entre duas linhas não aparece em nenhuma das duas', () => {
  const corte = 13
  const saida = filtrar([`  GET https://api/v2/empresas/${EMPRESA.slice(0, corte)}`, `${EMPRESA.slice(corte)}/nfe 200`], [EMPRESA])
  assert.deepEqual(saida, ['  GET https://api/v2/empresas/****', '****/nfe 200'])
})

test('continuação recuada pelo Postman também é mascarada', () => {
  const saida = filtrar([`│ ${EMPRESA.slice(0, 20)}`, `│   ${EMPRESA.slice(20)} fim`], [EMPRESA])
  assert.deepEqual(saida, ['│ ****', '│   **** fim'])
})

test('corte com \\r no fim da linha e cor ANSI na continuação também é mascarado', () => {
  const saida = filtrar([`url ${EMPRESA.slice(0, 10)}\r`, `\x1b[90m  ${EMPRESA.slice(10)}\x1b[0m`], [EMPRESA])
  assert.deepEqual(saida, ['url ****\r', '\x1b[90m  ****\x1b[0m'])
})

test('cor ANSI no fim da linha antes da quebra também é mascarada', () => {
  const saida = filtrar([`url ${EMPRESA.slice(0, 10)}\x1b[39m\r`, `${EMPRESA.slice(10)}/nfe`], [EMPRESA])
  assert.deepEqual(saida, ['url ****\x1b[39m\r', '****/nfe'])
})

test('corpo de resposta quebrado com "  | " no começo da continuação é mascarado', () => {
  const saida = filtrar([`  | r/file/${EMPRESA.slice(0, 14)}`, `  | ${EMPRESA.slice(14)}/pdf","link`], [EMPRESA])
  assert.deepEqual(saida, ['  | r/file/****', '  | ****/pdf","link'])
})

test('vários segredos, um inteiro e outro partido, saem todos mascarados', () => {
  const saida = filtrar([`Basic ${TOKEN} /empresas/${EMPRESA.slice(0, 5)}`, `${EMPRESA.slice(5)}`], [TOKEN, EMPRESA])
  assert.deepEqual(saida, ['Basic **** /empresas/****', '****'])
})

test('linha que só termina parecida com o começo do segredo fica intacta', () => {
  assert.deepEqual(filtrar(['fim 9f1c', 'outra coisa'], [EMPRESA]), ['fim 9f1c', 'outra coisa'])
})
