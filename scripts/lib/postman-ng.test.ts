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
  assert.ok(saida.every(l => !l.includes(EMPRESA.slice(0, 20)) && !l.includes(EMPRESA.slice(20))), saida.join('\n'))
})

test('vários segredos, um inteiro e outro partido, saem todos mascarados', () => {
  const saida = filtrar([`Basic ${TOKEN} /empresas/${EMPRESA.slice(0, 5)}`, `${EMPRESA.slice(5)}`], [TOKEN, EMPRESA])
  assert.deepEqual(saida, ['Basic **** /empresas/****', '****'])
})

test('linha que só termina parecida com o começo do segredo fica intacta', () => {
  assert.deepEqual(filtrar(['fim 9f1c', 'outra coisa'], [EMPRESA]), ['fim 9f1c', 'outra coisa'])
})
