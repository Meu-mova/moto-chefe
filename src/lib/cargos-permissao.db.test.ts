// Teste de banco: Postgres descartável, como src/lib/grupos-liberados.db.test.ts.
// Gerenciar cargos por pessoa (#617), com a persona real do admin_rede: as liberações vêm do banco,
// a sessão sai de usuarioDaRede, e o cargo só é criado se a permissão da sessão deixar.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let liberados: typeof import('@/lib/grupos-liberados')
let cargos: typeof import('@/lib/cargos')
let gestao: typeof import('@/lib/gestao-usuarios')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  liberados = await import('@/lib/grupos-liberados')
  cargos = await import('@/lib/cargos')
  gestao = await import('@/lib/gestao-usuarios')
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}
const linha = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { conta_id: string }[] }).rows

// Conta da rede (grupo da casa e um irmão, sem liberação) e Conta dona (um grupo liberado ao admin_rede).
async function cenario(tx: Tx) {
  const grupoComLoja = async (conta: string, nome: string, cnpj: string) => {
    const g = await linha(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${nome}, ${cnpj}, ${conta}) returning id`)
    const l = await linha(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja ' + nome}, 'C', 'R', ${g.id}) returning id`)
    return { grupo: g.id, loja: l.id }
  }
  const rede = await linha(tx, sql`insert into contas (nome) values ('Conta da rede 617') returning id`)
  const dona = await linha(tx, sql`insert into contas (nome) values ('Conta dona 617') returning id`)
  const casa = await grupoComLoja(rede.id, 'Casa 617', '00000000000617')
  const irmao = await grupoComLoja(rede.id, 'Irmao 617', '00000000000717')
  const liberado = await grupoComLoja(dona.id, 'Liberado 617', '00000000000817')
  const geral = await linha(tx, sql`insert into usuarios (id, nome, email, papel) values (gen_random_uuid(), 'Geral', 'geral-617@teste.invalid', 'admin_geral') returning id`)
  const usuario = await linha(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id, modulos_extras)
    values (gen_random_uuid(), 'Usuário Rede', 'rede-617@teste.invalid', 'admin_rede', ${casa.loja}, ${rede.id}, array['cargos']) returning id`)
  await tx.execute(sql`insert into grupos_liberados (usuario_id, grupo_id, liberado_por) values (${usuario.id}, ${liberado.grupo}, ${geral.id})`)
  const cadastro = { id: usuario.id, papel: 'admin_rede' as const, lojaId: casa.loja, contaId: rede.id, gruposAcesso: [irmao.grupo], gruposAprovacao: [] as string[], modulosExtras: ['cargos'], modulosBloqueados: [] as string[] }
  return { rede: rede.id, dona: dona.id, casa, irmao, liberado, usuarioId: usuario.id, cadastro }
}

// O que a casca das ações faz: sessão pela persona e, só com a permissão, cria na Conta da sessão.
async function tentarCriar(tx: Tx, c: Awaited<ReturnType<typeof cenario>>, grupoAtivoId: string | null) {
  const vivos = await liberados.gruposLiberadosVivos(c.usuarioId, new Date('2026-11-02T12:00:00Z'), tx)
  const sessao = liberados.usuarioDaRede(c.cadastro, vivos, grupoAtivoId)
  if (!gestao.podeGerenciarCargos(sessao)) return null
  return cargos.criarCargo(tx, { papel: sessao.papel, contaId: sessao.contaId, usuarioId: c.usuarioId }, { nome: 'Gerente A', papelBase: 'aux_adm' })
}

const cargosPorConta = async (tx: Tx) => (await linhas(tx, sql`select conta_id from cargos where nome = 'Gerente A'`)).map(l => l.conta_id)

test('admin_rede com a permissão, no cookie de grupo liberado de outra Conta: recusado, nada é criado (#617)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenario(tx)
    assert.equal(await tentarCriar(tx, c, c.liberado.grupo), null)
    assert.deepEqual(await cargosPorConta(tx), [])
  })
})

test('admin_rede com a permissão, sem cookie ou com cookie de grupo sem liberação: cria só na Conta própria (#617)', async () => {
  for (const cookie of ['nenhum', 'irmao'] as const) {
    await emTransacaoDesfeita(async tx => {
      const c = await cenario(tx)
      const r = await tentarCriar(tx, c, cookie === 'irmao' ? c.irmao.grupo : null)
      assert.equal(r?.ok, true, cookie)
      assert.deepEqual(await cargosPorConta(tx), [c.rede], `${cookie}: só na Conta da rede, nunca na dona`)
    })
  }
})

test('sem a permissão ligada no cadastro, nem na Conta própria o admin_rede cria cargo (#617)', async () => {
  await emTransacaoDesfeita(async tx => {
    const c = await cenario(tx)
    await tx.execute(sql`update usuarios set modulos_extras = '{}' where id = ${c.usuarioId}`)
    // O cadastro vem do banco, como a sessão real o lê.
    const { rows: [lido] } = (await tx.execute(sql`select modulos_extras from usuarios where id = ${c.usuarioId}`)) as unknown as { rows: { modulos_extras: string[] }[] }
    assert.deepEqual(lido.modulos_extras, [])
    assert.equal(await tentarCriar(tx, { ...c, cadastro: { ...c.cadastro, modulosExtras: lido.modulos_extras } }, null), null)
    assert.deepEqual(await cargosPorConta(tx), [])
  })
})
