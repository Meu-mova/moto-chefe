// Recusa da Precificação volta como { ok: false, erro } com a frase, para a tela mostrar o motivo
// (no build de produção um erro lançado vira "Minified React error", #404).
import test, { mock } from 'node:test'
import assert from 'node:assert/strict'
import { RecusaUsuario } from '@/lib/resultado-action'

let usuario = { papel: 'admin_socio' }
const chamadas: unknown[] = []
let recusaDoPreco: string | null = null
mock.module('@/lib/db', { namedExports: { db: {} } })
mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
mock.module('@/lib/grupo', { namedExports: { getGrupoAtivo: async () => ({ id: 'grupo-a', contaId: 'conta-a' }) } })
mock.module('@/lib/precificacao-modelos', { namedExports: {
  salvarPadraoSimulador: async (grupoId: string, padrao: string) => { chamadas.push(['padrao', grupoId, padrao]) },
  salvarPrecoDoModelo: async (grupo: { id: string }, data: unknown) => {
    if (recusaDoPreco) throw new RecusaUsuario(recusaDoPreco)
    chamadas.push(['preco', grupo.id, data])
  },
} })
mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })

test('padrão do simulador: grava no grupo ativo', async () => {
  const a = await import('./actions')
  chamadas.length = 0
  usuario = { papel: 'admin_socio' }
  assert.deepEqual(await a.salvarPadraoSimuladorAction('avista_12x'), { ok: true, dados: undefined })
  assert.deepEqual(chamadas, [['padrao', 'grupo-a', 'avista_12x']])
})

test('padrão do simulador: recusa padrão desconhecido e quem não é sócio, sem gravar', async () => {
  const a = await import('./actions')
  chamadas.length = 0
  usuario = { papel: 'admin_socio' }
  assert.deepEqual(await a.salvarPadraoSimuladorAction('outro'), { ok: false, erro: 'Padrão inválido' })
  for (const papel of ['aux_adm', 'vendedor']) {
    usuario = { papel }
    assert.deepEqual(await a.salvarPadraoSimuladorAction('taxas'), { ok: false, erro: 'Sem permissão' }, papel)
  }
  assert.deepEqual(chamadas, [])
})

test('preço do modelo: a recusa da regra chega à tela com a frase', async () => {
  const a = await import('./actions')
  usuario = { papel: 'admin_socio' }
  recusaDoPreco = 'Valor em 12x inválido'
  assert.deepEqual(
    await a.salvarPrecoAction({ nome: 'M', valorMinimo: '10', valor12x: '-1' }),
    { ok: false, erro: 'Valor em 12x inválido' },
  )
  recusaDoPreco = null
  chamadas.length = 0
  assert.deepEqual(await a.salvarPrecoAction({ nome: 'M', valorMinimo: '10', valor12x: '12' }), { ok: true, dados: undefined })
  assert.deepEqual(chamadas, [['preco', 'grupo-a', { nome: 'M', valorMinimo: '10', valor12x: '12' }]])
})
