import { test } from 'node:test'
import assert from 'node:assert/strict'
import { disponibilidadeDoGrupo } from './disponibilidade'

test('grupo configurado: emissão disponível, sem aviso', async () => {
  assert.deepEqual(await disponibilidadeDoGrupo('Grupo X', async () => ({ token: 't', empresaId: 'e', ambiente: 'Producao' }), true),
    { disponivel: true, ambiente: 'Producao', aviso: null })
})

test('grupo sem configuração: some sem aviso, como antes', async () => {
  assert.deepEqual(await disponibilidadeDoGrupo('Grupo X', async () => null, true), { disponivel: false, ambiente: null, aviso: null })
})

test('credencial que não decifra vira aviso com o grupo, sem o texto do erro (#578)', async () => {
  const r = await disponibilidadeDoGrupo('Grupo X', async () => { throw new Error('Unsupported state SEGREDO-123') }, true)
  assert.equal(r.disponivel, false)
  assert.equal(r.aviso, 'Credencial da Nota Gateway de Grupo X com problema. Salve de novo em Configuração → Notas Fiscais.')
  assert.doesNotMatch(r.aviso ?? '', /SEGREDO|Unsupported/)
})

test('quem não configura a NF é orientado a pedir a um administrador', async () => {
  const r = await disponibilidadeDoGrupo('Grupo X', async () => { throw new Error('x') }, false)
  assert.equal(r.aviso, 'Credencial da Nota Gateway de Grupo X com problema. Peça a um administrador para salvar de novo em Configuração → Notas Fiscais.')
})
