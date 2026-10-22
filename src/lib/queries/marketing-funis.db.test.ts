// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
// funisParaAdmin usa o db global, então os dados são gravados e apagados no after.
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
type M = typeof import('@/lib/queries/marketing')
let db: Db['db']
let funisParaAdmin: M['funisParaAdmin']
const grupos: string[] = []

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ funisParaAdmin } = await import('@/lib/queries/marketing'))
  const linha = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  for (const [nome, cnpj, lead] of [['A', '00000000032811', 932801], ['B', '00000000032812', 932802]] as const) {
    const conta = await linha(sql`insert into contas (nome) values (${'Funil 328 ' + nome}) returning id`)
    const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Funil 328 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
    grupos.push(grupo.id)
    await db.execute(sql`insert into kommo_leads (lead_id, pipeline_id) values (${lead}, ${'P328' + nome})`)
    await db.execute(sql`insert into kommo_pipeline_grupo (pipeline_id, grupo_id, atualizado_em) values (${'P328' + nome}, ${grupo.id}, now())`)
  }
})

after(async () => {
  await db.execute(sql`delete from kommo_pipeline_grupo where pipeline_id like 'P328%'`)
  await db.execute(sql`delete from kommo_leads where pipeline_id like 'P328%'`)
  await db.execute(sql`delete from grupos where nome like 'Funil 328%'`)
  await db.execute(sql`delete from contas where nome like 'Funil 328%'`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('funis da Kommo: o grupo B só recebe o próprio funil (#328)', async () => {
  const daB = (await funisParaAdmin(grupos[1])).map(f => f.pipelineId)
  assert.deepEqual(daB, ['P328B'])

  const todos = (await funisParaAdmin()).map(f => f.pipelineId)
  assert.ok(todos.includes('P328A') && todos.includes('P328B'), 'admin_geral vê todos')
})
