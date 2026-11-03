// A casca de getUsuarioLogado (#616): o cargo lido a cada requisição vira o papel base na sessão.
// Mock só na fronteira de fora (Supabase, Next, banco); a leitura do cargo no banco tem o teste
// em cargos.db.test.ts.
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'

const linha = {
  id: 'u1', nome: 'Marina', email: 'm@teste.invalid', ativo: true, papel: 'cargo', lojaId: 'loja', contaId: 'conta', cargoId: 'c1',
  gruposAcesso: [], gruposAprovacao: [], papeisExtras: [], modulosExtras: [], modulosBloqueados: [],
}
let cargoAtual: { nome: string; papelBase: string } | null = null
const db = { select: () => ({ from: () => ({ where: () => ({ limit: async () => [linha] }) }) }) }

mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => ({ auth: { getClaims: async () => ({ data: { claims: { sub: 'u1' } } }) } }) } })
mock.module('@/lib/db', { namedExports: { db } })
mock.module('next/navigation', { namedExports: { redirect: (destino: string) => { throw new Error(`redirect ${destino}`) } } })
mock.module('next/headers', { namedExports: { cookies: async () => ({ get: () => undefined }) } })
mock.module('@/lib/cargos', { namedExports: { cargoDoUsuario: async () => cargoAtual } })

test('quem tem cargo entra na sessão com o papel base e o nome do cargo; editar a base vale na requisição seguinte', async () => {
  const { getUsuarioLogado } = await import('./auth')
  cargoAtual = { nome: 'Gerente', papelBase: 'aux_adm' }
  const u = await getUsuarioLogado()
  assert.equal(u.papel, 'aux_adm')
  assert.equal(u.papelReal, 'cargo')
  assert.equal(u.cargoNome, 'Gerente')

  cargoAtual = { nome: 'Gerente', papelBase: 'vendedor' }
  assert.equal((await getUsuarioLogado()).papel, 'vendedor', 'a base editada vale na próxima leitura')
})

test('cargo que a consulta não achou deixa a sessão no papel cargo', async () => {
  const { getUsuarioLogado } = await import('./auth')
  cargoAtual = null
  const u = await getUsuarioLogado()
  assert.equal(u.papel, 'cargo')
  assert.equal(u.cargoNome, null)
})
