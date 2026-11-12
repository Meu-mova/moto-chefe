// Teste de banco: Postgres descartável. Remover moto (#692) com dados gravados de verdade, apagados no after:
// - corrida (achado 7 da r1): uma sessão grava o pagamento no cartão de uma OS da moto e segura a linha;
//   o Remover entra antes de ela confirmar e, ao soltar, tem de ver o pagamento e recusar;
// - Notas recebidas (achado 6), que lê fora de transação: a NF de entrada só volta a "pendente"
//   quando não sobra moto dela no grupo.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { sql } from 'drizzle-orm'
import { semearContaComMotos } from '@/test/semear-motos'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'RMC692'
type Db = typeof import('@/lib/db')
let db: Db['db']
let removerMotos: typeof import('@/lib/remover-motos')['removerMotos']
let listarNotasRecebidas: typeof import('@/lib/queries/nfe-recebidas')['listarNotasRecebidas']
let conta: Awaited<ReturnType<typeof semearContaComMotos>>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ removerMotos } = await import('@/lib/remover-motos'))
  ;({ listarNotasRecebidas } = await import('@/lib/queries/nfe-recebidas'))
  conta = await semearContaComMotos(db, P, 'A', '00000000069251', '00000000069252')
})

after(async () => {
  const daSemente = sql`(select id from motos where chassi like ${P + '%'})`
  for (const t of ['ordens_servico', 'historico_estoque']) await db.execute(sql`delete from ${sql.raw(t)} where moto_id in ${daSemente}`)
  await db.execute(sql`delete from log_acoes where usuario_id = ${conta.socioId}`)
  await db.execute(sql`delete from motos where chassi like ${P + '%'}`)
  await db.execute(sql`delete from modelos where modelo like ${P + '%'}`)
  await db.execute(sql`delete from usuarios where email like ${'%-' + P.toLowerCase() + '-%'}`)
  await db.execute(sql`delete from lojas where grupo_id in (${conta.base.grupoId}, ${conta.outro.grupoId})`)
  await db.execute(sql`delete from grupos where id in (${conta.base.grupoId}, ${conta.outro.grupoId})`)
  await db.execute(sql`delete from contas where id = ${conta.base.contaId}`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

// Sessões esperando lock por causa da sessão dada.
const esperandoPor = async (pid: number) => (await linhas(sql`select pid from pg_stat_activity where ${pid} = any(pg_blocking_pids(pid))`)).length

async function ate(condicao: () => Promise<boolean>, oQue: string) {
  for (let i = 0; i < 400; i++) { if (await condicao()) return; await new Promise(r => setImmediate(r)) }
  throw new Error('não chegou: ' + oQue)
}

test('pagamento no cartão gravado na OS durante a remoção: o Remover espera, vê o pagamento e recusa', async () => {
  const m = await conta.novaMoto('1')
  const [os] = await linhas(sql`insert into ordens_servico (numero, moto_id, loja_id, aberta_por, descricao)
    values (69251, ${m}, ${conta.base.lojaId}, ${conta.auxId}, 'revisão') returning id`)

  const pagador = new pg.Client({ connectionString: url })
  await pagador.connect()
  try {
    await pagador.query('begin')
    await pagador.query(`update ordens_servico set pagamentos = '[{"tipo":"cartao_credito","valor":100}]', forma_pagamento = 'cartao_credito' where id = $1`, [os.id])
    const pid = (await pagador.query('select pg_backend_pid() p')).rows[0].p as number

    const remocao = removerMotos(conta.socio, [m], 'importada errada', 'CONFIRMAR').then(r => ({ ok: r }), (e: Error) => ({ erro: e.message }))
    await ate(async () => (await esperandoPor(pid)) > 0, 'o Remover esperar o pagamento')
    await pagador.query('commit')

    assert.deepEqual(await remocao, { erro: `${P}A1: A OS nº 69251 tem pagamento registrado. Moto que passou pelo financeiro não se remove.` })
    assert.equal((await linhas(sql`select 1 from ordens_servico where id = ${os.id}`)).length, 1, 'a OS paga continua')
  } finally {
    await pagador.query('rollback').catch(() => {})
    await pagador.end()
  }
})

test('a NF de entrada só volta a "pendente" em Notas recebidas quando sai a última moto dela no grupo', async () => {
  // Número 88 nas posições 26 a 34 da chave; só as duas motos deste teste têm essa NF.
  const chave = '3'.repeat(25) + '000000088' + '0'.repeat(10)
  await db.execute(sql`insert into nfe_recebidas (grupo_id, chave, nsu, emitente_cnpj, emitente_nome, data_emissao, situacao)
    values (${conta.base.grupoId}, ${chave}, '1', '00000000000191', 'Fábrica', now(), 'completa')`)
  const jaLancada = async () => (await listarNotasRecebidas(conta.base.grupoId)).find(n => n.chave === chave)?.jaLancada
  const [m1, m2] = [await conta.novaMoto('NF1'), await conta.novaMoto('NF2')]
  await db.execute(sql`update motos set nota_fiscal_entrada = 'NF88' where id in (${m1}, ${m2})`)

  await removerMotos(conta.socio, [m1], 'duplicada', 'CONFIRMAR')
  assert.equal(await jaLancada(), true, 'a outra moto da NF continua')
  await removerMotos(conta.socio, [m2], 'NF do grupo errado', 'CONFIRMAR')
  assert.equal(await jaLancada(), false)
})
