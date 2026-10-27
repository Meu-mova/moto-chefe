import { test } from 'node:test'
import assert from 'node:assert/strict'
import { credencialParaTela } from './credencial-tela'

const cfg = {
  token: 'TOKEN-CIFRADO', empresaId: 'ID-DA-EMPRESA-NA-NG', ambiente: 'Producao',
  serieNfe: '2', proximoNumero: 10, certificadoEnviadoEm: new Date('2026-10-20T12:00:00Z'),
}

test('o que vai para a tela não leva o empresaId nem o token, só se estão cadastrados', () => {
  const c = credencialParaTela(cfg)
  assert.deepEqual(c, {
    temToken: true, temEmpresa: true, ambiente: 'Producao', serieNfe: '2', proximoNumero: 10,
    certificadoEnviadoEm: '2026-10-20T12:00:00.000Z',
  })
  const json = JSON.stringify(c)
  assert.ok(!json.includes('ID-DA-EMPRESA-NA-NG'))
  assert.ok(!json.includes('TOKEN-CIFRADO'))
})

test('sem empresa cadastrada na NG: temEmpresa falso', () => {
  assert.equal(credencialParaTela({ ...cfg, empresaId: null }).temEmpresa, false)
})
