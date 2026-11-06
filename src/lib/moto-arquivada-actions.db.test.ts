// Teste de banco: Postgres descartável. Transferir e abrir garantia em moto arquivada (#688):
// as Server Actions devolvem a frase como { ok: false, erro } (em produção o React troca a
// mensagem de um throw, #404) e não gravam nada. Fronteira de fora mockada: sessão,
// Supabase (a garantia ainda chama o rpc) e next/cache.
import { after, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'MAA688'
let usuarioDaSessao: Record<string, unknown> = {}
const rpcs: string[] = []
const mocks = [
  mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuarioDaSessao } }),
  mock.module('@/lib/supabase/server', { namedExports: { createClient: async () => ({ rpc: async (nome: string) => { rpcs.push(nome); return { error: null } } }) } }),
  mock.module('next/cache', { namedExports: { revalidatePath: () => {} } }),
]

type Db = typeof import('@/lib/db')
let db: Db['db']
let solicitarTransferenciaAction: typeof import('@/app/(dashboard)/transferencias/actions')['solicitarTransferenciaAction']
let abrirGarantiaAction: typeof import('@/app/(dashboard)/garantias/actions')['abrirGarantiaAction']
let MOTO_ARQUIVADA: string
const semente = { contaId: '', grupoId: '', lojaId: '', destinoId: '', arquivada: '', viva: '' }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ solicitarTransferenciaAction } = await import('@/app/(dashboard)/transferencias/actions'))
  ;({ abrirGarantiaAction } = await import('@/app/(dashboard)/garantias/actions'))
  ;({ MOTO_ARQUIVADA } = await import('@/lib/arquivar-moto-regras'))
  // As actions usam o db global: a semente é gravada e apagada no after.
  const base = await semearContaBase(db, { prefixo: P, nome: 'A', cnpj: '00000000068850' })
  const socioId = await semearUsuario(db, base, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  const [destino] = await linhas(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Destino ' + P}, 'C', 'R', ${base.grupoId}) returning id`)
  const [modelo] = await linhas(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${P}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const moto = async (chassi: string) => (await linhas(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${modelo.id}, ${base.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`))[0].id as string
  Object.assign(semente, { contaId: base.contaId, grupoId: base.grupoId, lojaId: base.lojaId, destinoId: destino.id, arquivada: await moto(P + 'ARQ'), viva: await moto(P + 'VIVA') })
  await db.execute(sql`update motos set arquivada_em = now(), arquivada_por = ${socioId}, motivo_arquivo = 'golpe' where id = ${semente.arquivada}`)
  usuarioDaSessao = { id: socioId, papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId, grupoLiberado: null }
})

after(async () => {
  await db.execute(sql`delete from transferencias where moto_id in (select id from motos where chassi like ${P + '%'})`)
  await db.execute(sql`delete from garantias where moto_id in (select id from motos where chassi like ${P + '%'})`)
  await db.execute(sql`delete from historico_estoque where moto_id in (select id from motos where chassi like ${P + '%'})`)
  await db.execute(sql`delete from motos where chassi like ${P + '%'}`)
  await db.execute(sql`delete from modelos where modelo = ${P}`)
  await db.execute(sql`delete from usuarios where email like ${'%-' + P.toLowerCase() + '-%'}`)
  await db.execute(sql`delete from lojas where grupo_id = ${semente.grupoId}`)
  await db.execute(sql`delete from grupos where id = ${semente.grupoId}`)
  await db.execute(sql`delete from contas where id = ${semente.contaId}`)
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const garantia = (motoId: string) => ({ motoId, descricao: 'bateria', dataInicio: '2026-11-05' })

const pendentes = async (tabela: 'transferencias' | 'garantias', status: string) => Object.fromEntries((await linhas(sql`
  select m.id, count(t.id)::int as n from motos m left join ${sql.raw(tabela)} t on t.moto_id = m.id and t.status = ${status}
  where m.id in (${semente.arquivada}, ${semente.viva}) group by m.id`)).map(r => [r.id === semente.arquivada ? 'arquivada' : 'viva', r.n]))

test('transferir moto arquivada devolve a frase e não grava; a viva fica com a transferência pendente', async () => {
  assert.deepEqual(await solicitarTransferenciaAction(semente.arquivada, semente.destinoId), { ok: false, erro: MOTO_ARQUIVADA })
  assert.deepEqual(await solicitarTransferenciaAction(semente.viva, semente.destinoId), { ok: true, dados: undefined })
  assert.deepEqual(await pendentes('transferencias', 'pendente'), { arquivada: 0, viva: 1 })
})

test('abrir garantia em moto arquivada devolve a frase e não chama o banco de garantia; a viva segue', async () => {
  rpcs.length = 0
  assert.deepEqual(await abrirGarantiaAction(garantia(semente.arquivada)), { ok: false, erro: MOTO_ARQUIVADA })
  assert.deepEqual(rpcs, [])
  assert.deepEqual(await abrirGarantiaAction(garantia(semente.viva)), { ok: true, dados: undefined })
  assert.deepEqual(rpcs, ['abrir_garantia'])
})
