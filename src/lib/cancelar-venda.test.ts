import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PAPEIS_QUE_CANCELAM_VENDA, travaDoPapel } from './cancelar-venda'

test('aux_adm é recusado em venda com número de NF preenchido, com o número na mensagem', () => {
  assert.equal(
    travaDoPapel('aux_adm', '1234'),
    'Esta venda tem NF registrada (nº 1234). Cancelar venda com nota fiscal fica com os administradores; fale com o Cesar.',
  )
})

test('aux_adm não é recusado pelo papel em venda sem NF registrada', () => {
  assert.equal(travaDoPapel('aux_adm', null), null)
  assert.equal(travaDoPapel('aux_adm', ''), null)
})

test('admins não são recusados pelo papel, mesmo com NF registrada', () => {
  assert.equal(travaDoPapel('admin_geral', '1234'), null)
  assert.equal(travaDoPapel('admin_socio', '1234'), null)
})

test('cancelam venda: admin_geral, admin_socio e aux_adm; vendedor e mecânico não', () => {
  for (const p of ['admin_geral', 'admin_socio', 'aux_adm']) assert.equal(PAPEIS_QUE_CANCELAM_VENDA.has(p), true, p)
  for (const p of ['vendedor', 'mecanico']) assert.equal(PAPEIS_QUE_CANCELAM_VENDA.has(p), false, p)
})
