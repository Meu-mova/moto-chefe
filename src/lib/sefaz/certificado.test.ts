import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { lerDadosDoPfx } from './certificado'

// O .pfx real do Sul de Minas está fora do repo. Quando a variável não estiver
// apontando para ele, o teste é pulado em vez de falhar — CI não tem o
// certificado, e um teste vermelho por falta de arquivo ensina a ignorar
// vermelho.
const CAMINHO = process.env.NFSE_CERT_PATH
const SENHA = process.env.NFSE_CERT_PASS

test('lê CNPJ, titular e validade de um .pfx real', { skip: !CAMINHO || !existsSync(CAMINHO) }, () => {
  const dados = lerDadosDoPfx(readFileSync(CAMINHO!), SENHA!)
  assert.match(dados.cnpj, /^\d{14}$/)
  assert.ok(dados.titular.length > 0)
  assert.ok(dados.validoAte instanceof Date)
  assert.ok(dados.validoAte.getTime() > Date.now(), 'certificado já vencido')
})

test('senha errada falha com mensagem de senha, não com erro de parse', { skip: !CAMINHO || !existsSync(CAMINHO) }, () => {
  assert.throws(
    () => lerDadosDoPfx(readFileSync(CAMINHO!), 'senha-errada'),
    /senha/i,
  )
})
