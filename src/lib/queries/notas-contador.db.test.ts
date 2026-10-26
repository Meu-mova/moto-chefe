// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Q = typeof import('@/lib/queries/notas-contador')
let db: Db['db']
let q: Q
let registrarAcaoSensivel: typeof import('@/lib/log-acoes')['registrarAcaoSensivel']
let HOJE: { de: string; ate: string }

before(async () => {
  ;({ db } = await import('@/lib/db'))
  q = await import('@/lib/queries/notas-contador')
  ;({ registrarAcaoSensivel } = await import('@/lib/log-acoes'))
  const hoje = (await import('@/lib/data-venda')).hojeBrt()
  HOJE = { de: hoje, ate: hoje }
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('Envio ao contador: a Conta B não lê, não grava e não envia nada da Conta A (#402)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (s: ReturnType<typeof sql>) => ((await tx.execute(s)) as unknown as { rows: { id: string }[] }).rows[0]
    const ids: Record<string, { conta: string; grupo: string }> = {}
    for (const [nome, cnpj] of [['A', '00000000040211'], ['B', '00000000040212']] as const) {
      const conta = await linha(sql`insert into contas (nome) values (${'Contador 402 ' + nome}) returning id`)
      const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Contador 402 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
      ids[nome] = { conta: conta.id, grupo: grupo.id }
    }
    const notas: [string, string, string, string][] = [
      ['A', 'Autorizada', 'Producao', 'A1'], ['A', 'Cancelada', 'Producao', 'A2'], ['A', 'Negada', 'Producao', 'A3'],
      ['A', 'Autorizada', 'Homologacao', 'A4'], ['B', 'Autorizada', 'Producao', 'B1'],
    ]
    // venda_id nulo: a nota sobrevive à venda cancelada (0144).
    for (const [dono, status, ambiente, numero] of notas) {
      await tx.execute(sql`insert into notas_fiscais_saida (grupo_id, venda_numero, id_externo, ambiente, status, numero, serie, payload)
        values (${ids[dono].grupo}, 1, ${'ext402c' + numero}, ${ambiente}, ${status}, ${numero}, '1', '{}'::jsonb)`)
    }
    const A = { grupoId: ids.A.grupo, contaId: ids.A.conta }
    const BnoGrupoDaA = { grupoId: ids.A.grupo, contaId: ids.B.conta }

    // Só produção, autorizadas e canceladas.
    assert.deepEqual((await q.notasParaContador({ ...A, ...HOJE }, tx)).map(n => n.numero).sort(), ['A1', 'A2'])
    assert.deepEqual(await q.notasParaContador({ ...BnoGrupoDaA, ...HOJE }, tx), [])

    // E-mail: a B não grava nem lê o da A; a A grava e lê o seu.
    assert.equal(await q.salvarEmailDoContador({ ...BnoGrupoDaA, email: 'intruso@x.com' }, tx), false)
    assert.equal(await q.emailDoContador(A, tx), null)
    assert.equal(await q.salvarEmailDoContador({ ...A, email: 'contador@a.com' }, tx), true)
    assert.equal(await q.emailDoContador(A, tx), 'contador@a.com')
    assert.equal(await q.emailDoContador(BnoGrupoDaA, tx), null)
    assert.equal(await q.emailDoContador({ grupoId: ids.B.grupo, contaId: ids.B.conta }, tx), null)

    // Último envio: o da A não aparece para a B, nem no grupo da B.
    assert.equal(await q.ultimoEnvioAoContador(A, tx), null)
    await registrarAcaoSensivel({ tipo: 'notas_enviadas_contador', usuarioId: randomUUID(), grupoId: ids.A.grupo,
      detalhe: { para: 'contador@a.com', de: HOJE.de, ate: HOJE.ate, notas: 2, modo: 'anexo' } }, tx)
    const ultimo = await q.ultimoEnvioAoContador(A, tx)
    assert.deepEqual(ultimo && { para: ultimo.para, notas: ultimo.notas }, { para: 'contador@a.com', notas: 2 })
    assert.equal(await q.ultimoEnvioAoContador(BnoGrupoDaA, tx), null)
    assert.equal(await q.ultimoEnvioAoContador({ grupoId: ids.B.grupo, contaId: ids.B.conta }, tx), null)
    // admin_geral (sem Conta) continua preso ao grupo pedido.
    assert.equal((await q.ultimoEnvioAoContador({ grupoId: ids.A.grupo, contaId: null }, tx))?.para, 'contador@a.com')
    throw new Desfazer()
  }), Desfazer)
})
