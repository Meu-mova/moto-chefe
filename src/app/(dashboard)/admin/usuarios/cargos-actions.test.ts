// As ações de cargo são só do admin_geral (#616): as demais funções recusam antes de tocar no banco.
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

let usuario: { papel: string; papelReal?: string } = { papel: 'admin_socio' }
mock.module('@/lib/db', { namedExports: { db: {} } })
mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
mock.module('@/lib/grupo', { namedExports: { contaDoGrupoAtivo: async () => 'conta-a' } })
mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })

test('sócio e admin de rede (que opera como sócio) não criam, editam nem apagam cargo (#616)', async () => {
  const a = await import('./cargos-actions')
  const recusa = { ok: false, erro: 'Sem permissão para gerenciar cargos' }
  for (const u of [{ papel: 'admin_socio' }, { papel: 'admin_socio', papelReal: 'admin_rede' }, { papel: 'aux_adm' }]) {
    usuario = u
    assert.deepEqual(await a.criarCargoAction({ nome: 'Gerente', papelBase: 'aux_adm' }), recusa, JSON.stringify(u))
    assert.deepEqual(await a.editarCargoAction('id', { nome: 'Gerente', papelBase: 'aux_adm' }), recusa, JSON.stringify(u))
    assert.deepEqual(await a.apagarCargoAction('id'), recusa, JSON.stringify(u))
  }
})
