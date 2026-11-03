// A sessão vira gestor: a permissão de cargos e as telas que ele pode repassar (#617).
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

let usuario: Record<string, unknown> = {}
mock.module('@/lib/db', { namedExports: { db: {} } })
mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
mock.module('@/lib/grupo', { namedExports: {
  listarGruposVisiveis: async () => [{ id: 'g1' }],
  grupoIdDaPropriaLoja: async () => 'g1',
} })

const sessao = { id: 'u', lojaId: 'l1', gruposAprovacao: [], aprovaPagamentoSensivel: false, ativo: true }

test('sócio com Gerenciar cargos ligado é gestor de cargos, e a permissão não entra nas telas que ele repassa (#617)', async () => {
  const { gestorDaSessao } = await import('./gestor-da-sessao')
  usuario = { ...sessao, papel: 'admin_socio', modulosExtras: ['cargos', 'entrada'] }
  const g = await gestorDaSessao()
  assert.equal(g.podeCargos, true)
  assert.ok(g.itensLiberaveis.includes('entrada'))
  assert.ok(!g.itensLiberaveis.includes('cargos'))
})

test('sócio sem a permissão, e na persona do admin de rede, não gerenciam cargos (#617)', async () => {
  const { gestorDaSessao } = await import('./gestor-da-sessao')
  usuario = { ...sessao, papel: 'admin_socio', modulosExtras: [] }
  assert.equal((await gestorDaSessao()).podeCargos, false)
  usuario = { ...sessao, papel: 'admin_socio', papelReal: 'admin_rede', modulosExtras: ['cargos'], grupoLiberado: 'g-de-fora' }
  assert.equal((await gestorDaSessao()).podeCargos, false)
})

test('admin_geral gerencia cargos sempre (#617)', async () => {
  const { gestorDaSessao } = await import('./gestor-da-sessao')
  usuario = { ...sessao, papel: 'admin_geral' }
  assert.equal((await gestorDaSessao()).podeCargos, true)
})
