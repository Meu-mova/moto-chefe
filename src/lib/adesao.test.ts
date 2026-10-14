import { test } from 'node:test'
import assert from 'node:assert/strict'
import { adesaoSchema, validarArquivoCnpj, validarArquivoCert, emailNovaAdesao } from './adesao'

const base = {
  loja: 'Loja Centro', responsavel: 'Carlos', celular: '(35) 99999-0000',
  certSenha: 'x', storeLogin: 'l', storeSenha: 's',
  usuarios: [{ nome: 'Ana', email: 'ana@x.com', papel: 'vendedor' }],
}

test('adesaoSchema aceita dados válidos', () => {
  assert.equal(adesaoSchema.safeParse(base).success, true)
})

test('adesaoSchema recusa papel fora da lista, inclusive admin_geral', () => {
  const r = adesaoSchema.safeParse({ ...base, usuarios: [{ nome: 'Ana', email: 'ana@x.com', papel: 'admin_geral' }] })
  assert.equal(r.success, false)
})

test('adesaoSchema recusa celular curto, e-mail ruim e lista de usuários vazia', () => {
  assert.equal(adesaoSchema.safeParse({ ...base, celular: '123' }).success, false)
  assert.equal(adesaoSchema.safeParse({ ...base, usuarios: [{ nome: 'Ana', email: 'x', papel: 'vendedor' }] }).success, false)
  assert.equal(adesaoSchema.safeParse({ ...base, usuarios: [] }).success, false)
})

test('validarArquivoCnpj aceita PDF e imagem, recusa vazio, grande e outro tipo', () => {
  assert.deepEqual(validarArquivoCnpj({ type: 'application/pdf', size: 1000 }), { ok: true, extensao: 'pdf' })
  assert.equal(validarArquivoCnpj({ type: 'image/png', size: 1000 }).ok, true)
  assert.equal(validarArquivoCnpj({ type: 'application/pdf', size: 0 }).ok, false)
  assert.equal(validarArquivoCnpj({ type: 'application/pdf', size: 6 * 1024 * 1024 }).ok, false)
  assert.equal(validarArquivoCnpj({ type: 'text/html', size: 1000 }).ok, false)
})

test('validarArquivoCert exige .pfx/.p12 com cabeçalho DER', () => {
  const der = new Uint8Array([0x30, 0x82, 0x01])
  assert.equal(validarArquivoCert('empresa.pfx', der).ok, true)
  assert.equal(validarArquivoCert('empresa.P12', der).ok, true)
  assert.equal(validarArquivoCert('empresa.pfx', new Uint8Array([0x25, 0x50])).ok, false)
  assert.equal(validarArquivoCert('empresa.pdf', der).ok, false)
  assert.equal(validarArquivoCert('empresa.pfx', new Uint8Array()).ok, false)
})

test('emailNovaAdesao não carrega senha nem arquivo', () => {
  const e = emailNovaAdesao({ id: 'abc', loja: 'Loja', responsavel: 'C', celular: '1', usuarios: 2 })
  assert.match(e.assunto, /Loja/)
  assert.doesNotMatch(e.texto, /senha:/i)
})
