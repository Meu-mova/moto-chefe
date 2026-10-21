// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
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
type Log = typeof import('@/lib/log-acoes')
let db: Db['db']
let registrarAcao: Log['registrarAcao']
let apagarLogAntigo: Log['apagarLogAntigo']
let registrarAcaoSensivel: Log['registrarAcaoSensivel']
let listarLog: typeof import('@/lib/queries/log-acoes')['listarLog']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ registrarAcao, apagarLogAntigo, registrarAcaoSensivel } = await import('@/lib/log-acoes'))
  ;({ listarLog } = await import('@/lib/queries/log-acoes'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]

async function cenario(tx: Tx) {
  const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  const conta = await linha(sql`insert into contas (nome) values ('Conta') returning id`)
  const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Sul', '00000000000191', ${conta.id}) returning id`)
  const outro = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('BH', '00000000000272', ${conta.id}) returning id`)
  const usuario = await linha(sql`insert into usuarios (id, nome, email, papel, conta_id) values (gen_random_uuid(), 'Ana', 'ana@t.com', 'aux_adm', ${conta.id}) returning id`)
  return { conta: conta.id, grupo: grupo.id, outro: outro.id, usuario: usuario.id }
}

async function linhasDoUsuario(tx: Tx, usuarioId: string) {
  const r = (await tx.execute(sql`select tipo, grupo_id, conta_id from log_acoes where usuario_id = ${usuarioId} order by criado_em`)) as unknown as { rows: { tipo: string; grupo_id: string | null; conta_id: string | null }[] }
  return r.rows
}

test('1º uso do dia: uma linha por pessoa, dia e grupo', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const base = { usuarioId: c.usuario, contaId: c.conta, ip: '1.1.1.1', userAgent: 'x' }
    await registrarAcao({ ...base, tipo: 'acesso_dia', grupoId: c.grupo }, tx)
    await registrarAcao({ ...base, tipo: 'acesso_dia', grupoId: c.grupo }, tx)
    await registrarAcao({ ...base, tipo: 'acesso_dia', grupoId: c.outro }, tx)
    await registrarAcao({ ...base, tipo: 'login', grupoId: null }, tx)
    await registrarAcao({ ...base, tipo: 'login', grupoId: null }, tx)
    const linhas = await linhasDoUsuario(tx, c.usuario)
    assert.equal(linhas.filter(l => l.tipo === 'acesso_dia').length, 2, 'repetir no mesmo grupo e dia não grava de novo')
    assert.equal(linhas.filter(l => l.tipo === 'login').length, 2, 'todo login grava')
    throw new Desfazer()
  }), Desfazer)
})

test('tipo fora da lista é recusado pelo banco', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await assert.rejects(tx.execute(sql`insert into log_acoes (usuario_id, tipo, dia) values (${c.usuario}, 'qualquer', current_date)`))
    throw new Desfazer()
  }), Desfazer)
})

test('limpeza apaga só o que passou de 12 meses', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await tx.execute(sql`insert into log_acoes (usuario_id, conta_id, tipo, dia, criado_em) values
      (${c.usuario}, ${c.conta}, 'login', current_date, now() - interval '12 months 1 day'),
      (${c.usuario}, ${c.conta}, 'login', current_date, now() - interval '11 months 28 days'),
      (${c.usuario}, ${c.conta}, 'login', current_date, now())`)
    const apagadas = await apagarLogAntigo(tx)
    assert.equal(apagadas, 1)
    assert.equal((await linhasDoUsuario(tx, c.usuario)).length, 2)
    throw new Desfazer()
  }), Desfazer)
})

test('excluir o usuário não falha por causa do log, e o log fica', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await registrarAcao({ tipo: 'login', usuarioId: c.usuario, contaId: c.conta, grupoId: null, ip: null, userAgent: null }, tx)
    await tx.execute(sql`delete from usuarios where id = ${c.usuario}`)
    assert.equal((await linhasDoUsuario(tx, c.usuario)).length, 1)
    throw new Desfazer()
  }), Desfazer)
})

test('ação sensível: grava na Conta do grupo do registro, não na de quem fez', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const outra = await linha(sql`insert into contas (nome) values ('Outra') returning id`)
    const grupoDeFora = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('X', '00000000000353', ${outra.id}) returning id`)
    for (const tipo of ['venda_cancelada', 'nf_emitida', 'nf_cancelada'] as const) {
      await registrarAcaoSensivel({ tipo, usuarioId: c.usuario, grupoId: grupoDeFora.id, detalhe: { venda: 1 } }, tx)
    }
    await registrarAcaoSensivel({ tipo: 'permissao_alterada', usuarioId: c.usuario, grupoId: null, contaId: c.conta, detalhe: { acao: 'criado' } }, tx)
    const linhas = await linhasDoUsuario(tx, c.usuario)
    assert.deepEqual(linhas.map(l => l.conta_id), [outra.id, outra.id, outra.id, c.conta])
    throw new Desfazer()
  }), Desfazer)
})

test('a tela de uma Conta não traz linha de outra; "todas" traz as duas', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const outra = await linha(sql`insert into contas (nome) values ('Outra') returning id`)
    const base = { usuarioId: c.usuario, grupoId: null, ip: null, userAgent: null }
    await registrarAcao({ ...base, tipo: 'login', contaId: c.conta }, tx)
    await registrarAcao({ ...base, tipo: 'login', contaId: outra.id }, tx)
    const hoje = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
    const periodo = { de: hoje, ate: hoje }
    const daConta = await listarLog({ contaId: c.conta, ...periodo }, tx)
    assert.deepEqual(daConta.filter(e => e.usuarioId === c.usuario).map(e => e.contaId), [c.conta])
    const todas = await listarLog({ contaId: 'todas', ...periodo }, tx)
    assert.equal(todas.filter(e => e.usuarioId === c.usuario).length, 2)
    throw new Desfazer()
  }), Desfazer)
})
