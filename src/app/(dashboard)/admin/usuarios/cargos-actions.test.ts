// As ações de cargo exigem a permissão Gerenciar cargos (#617); sem ela recusam antes de tocar no banco.
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

type Sessao = { id?: string; papel: string; papelReal?: string; modulosExtras?: string[]; modulosBloqueados?: string[]; grupoLiberado?: string | null }
let usuario: Sessao = { papel: 'admin_socio' }
const chamadas: unknown[] = []
mock.module('@/lib/db', { namedExports: { db: {} } })
mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
mock.module('@/lib/grupo', { namedExports: { contaDoGrupoAtivo: async () => 'conta-a' } })
mock.module('@/lib/cargos', { namedExports: {
  criarCargo: async (_db: unknown, quem: unknown) => { chamadas.push(['criar', quem]); return { ok: true, id: 'novo' } },
  editarCargo: async (_db: unknown, quem: unknown) => { chamadas.push(['editar', quem]); return { ok: true } },
  apagarCargo: async (_db: unknown, quem: unknown) => { chamadas.push(['apagar', quem]); return { ok: true } },
} })
mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })

test('sem a permissão, sócio e admin de rede (que opera como sócio) não criam, editam nem apagam cargo (#616)', async () => {
  const a = await import('./cargos-actions')
  const recusa = { ok: false, erro: 'Sem permissão para gerenciar cargos' }
  for (const u of [{ papel: 'admin_socio' }, { papel: 'admin_socio', papelReal: 'admin_rede' }, { papel: 'aux_adm' }]) {
    usuario = u
    assert.deepEqual(await a.criarCargoAction({ nome: 'Gerente', papelBase: 'aux_adm' }), recusa, JSON.stringify(u))
    assert.deepEqual(await a.editarCargoAction('id', { nome: 'Gerente', papelBase: 'aux_adm' }), recusa, JSON.stringify(u))
    assert.deepEqual(await a.apagarCargoAction('id'), recusa, JSON.stringify(u))
  }
})

const dados = { nome: 'Gerente', papelBase: 'aux_adm' }

test('com a permissão ligada, sócio e admin de rede gerenciam cargos da Conta do grupo ativo (#617)', async () => {
  const a = await import('./cargos-actions')
  for (const u of [{ papel: 'admin_socio' }, { papel: 'admin_socio', papelReal: 'admin_rede' }]) {
    chamadas.length = 0
    usuario = { id: 'u1', ...u, modulosExtras: ['cargos'] }
    assert.deepEqual(await a.criarCargoAction(dados), { ok: true }, JSON.stringify(u))
    assert.deepEqual(await a.editarCargoAction('id', dados), { ok: true })
    assert.deepEqual(await a.apagarCargoAction('id'), { ok: true })
    const quem = { papel: 'admin_socio', contaId: 'conta-a', usuarioId: 'u1' }
    assert.deepEqual(chamadas, [['criar', quem], ['editar', quem], ['apagar', quem]], 'o contaId é o do grupo ativo, não do cliente')
  }
})

test('a permissão não vale na persona de grupo liberado, bloqueada nem para outros papéis (#617)', async () => {
  const a = await import('./cargos-actions')
  const recusa = { ok: false, erro: 'Sem permissão para gerenciar cargos' }
  for (const u of [
    { papel: 'admin_socio', papelReal: 'admin_rede', modulosExtras: ['cargos'], grupoLiberado: 'g-de-fora' },
    { papel: 'admin_socio', modulosExtras: ['cargos'], modulosBloqueados: ['cargos'] },
    { papel: 'aux_adm', modulosExtras: ['cargos'] },
    { papel: 'cargo', modulosExtras: ['cargos'] },
  ]) {
    chamadas.length = 0
    usuario = u
    assert.deepEqual(await a.criarCargoAction(dados), recusa, JSON.stringify(u))
    assert.deepEqual(await a.apagarCargoAction('id'), recusa, JSON.stringify(u))
    assert.deepEqual(chamadas, [], 'nada chega às regras de cargo')
  }
})
