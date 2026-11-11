import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validarAcessoFabrica, validarSenhaFabrica } from './acessos-fabrica'

test('acesso da fábrica: limpa nome e e-mail e aceita senha de 8+', () => {
  assert.deepEqual(validarAcessoFabrica({ nome: '  Fábrica  ', email: ' Comercial@MotoChefe.com ', senha: '12345678' }),
    { ok: true, dados: { nome: 'Fábrica', email: 'comercial@motochefe.com', senha: '12345678' } })
})

test('acesso da fábrica: recusa nome vazio, e-mail inválido e senha curta, com a frase de cada um', () => {
  const r = (nome: string, email: string, senha: string) => validarAcessoFabrica({ nome, email, senha })
  assert.match((r(' ', 'a@b.co', '12345678') as { erro: string }).erro, /nome/)
  assert.match((r('F', 'sem-arroba', '12345678') as { erro: string }).erro, /e-mail/)
  assert.match((r('F', 'a@b.co', '1234567') as { erro: string }).erro, /8 caracteres/)
  assert.equal(validarSenhaFabrica('12345678'), null)
})
