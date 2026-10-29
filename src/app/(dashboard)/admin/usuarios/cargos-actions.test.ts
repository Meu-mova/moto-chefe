// Cargos escondidos na v1.14.0 (#449): as actions recusam antes de tocar no banco.
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

mock.module('@/lib/db', { namedExports: { db: {} } })
mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => ({ papel: 'admin_socio' }) } })
mock.module('@/lib/grupo', { namedExports: { contaDoGrupoAtivo: async () => 'conta-a' } })
mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })

test('criar, editar e apagar cargo recusam com "Função indisponível" (#449)', async () => {
  const a = await import('./cargos-actions')
  const recusa = { ok: false, erro: 'Função indisponível' }
  assert.deepEqual(await a.criarCargoAction({ nome: 'Recepção', modulos: [] }), recusa)
  assert.deepEqual(await a.editarCargoAction('id', { nome: 'Recepção', modulos: [] }), recusa)
  assert.deepEqual(await a.apagarCargoAction('id'), recusa)
})
