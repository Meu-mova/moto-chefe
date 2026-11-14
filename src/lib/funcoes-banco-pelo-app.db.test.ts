// Teste de banco: as ações que chamam funções do banco (transferência, garantia, status da moto)
// gravam pela conexão do app, sem depender da sessão do usuário no Supabase (#891).
// Roda no Postgres descartável do CI. Local: `npm run test:db:local`.
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

const P = 'FBA891'
let usuarioDaSessao: Record<string, unknown> = {}
const mocks = [
  mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuarioDaSessao } }),
  mock.module('next/cache', { namedExports: { revalidatePath: () => {} } }),
]

type Db = typeof import('@/lib/db')
let db: Db['db']
let transf: typeof import('@/app/(dashboard)/transferencias/actions')
let garantiasActions: typeof import('@/app/(dashboard)/garantias/actions')
let alterarStatusAction: typeof import('@/app/(dashboard)/estoque/[id]/actions')['alterarStatusAction']
let correcaoStatusAdminAction: typeof import('@/app/(dashboard)/admin/acoes/actions')['correcaoStatusAdminAction']
const s = { contaId: '', grupoId: '', lojaId: '', destinoId: '', modeloId: '' }
const quem = { socio: {}, aux: {}, admin: {} } as Record<'socio' | 'aux' | 'admin', Record<string, unknown>>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows
const umaLinha = async (q: ReturnType<typeof sql>) => (await linhas(q))[0]

let chassis = 0
const novaMoto = async (status = 'montada') => (await umaLinha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
  values (${`${P}${++chassis}`}, ${s.modeloId}, ${s.lojaId}, 'CINZA', '1', ${status}, 'disponivel') returning id`)).id as string

const ultimoHistorico = (motoId: string) => umaLinha(sql`select status_anterior, status_novo, observacao, usuario_id
  from historico_estoque where moto_id = ${motoId} and tipo = 'mudanca_status' order by data desc limit 1`)

before(async () => {
  ;({ db } = await import('@/lib/db'))
  transf = await import('@/app/(dashboard)/transferencias/actions')
  garantiasActions = await import('@/app/(dashboard)/garantias/actions')
  ;({ alterarStatusAction } = await import('@/app/(dashboard)/estoque/[id]/actions'))
  ;({ correcaoStatusAdminAction } = await import('@/app/(dashboard)/admin/acoes/actions'))
  // As actions usam o db global: a semente é gravada e apagada no after.
  const base = await semearContaBase(db, { prefixo: P, nome: 'A', cnpj: '00000000089111' })
  const destino = await umaLinha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Destino ' + P}, 'C', 'R', ${base.grupoId}) returning id`)
  const modelo = await umaLinha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${P}, 'autopropelido', '1000', 'hub', '32') returning id`)
  Object.assign(s, { contaId: base.contaId, grupoId: base.grupoId, lojaId: base.lojaId, destinoId: destino.id, modeloId: modelo.id })
  const comum = { gruposAcesso: [base.grupoId], contaId: base.contaId, grupoLiberado: null }
  quem.socio = { ...comum, id: await semearUsuario(db, base, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true }), papel: 'admin_socio', lojaId: null }
  quem.aux = { ...comum, id: await semearUsuario(db, base, { papel: 'aux_adm', rotulo: 'aux' }), papel: 'aux_adm', lojaId: base.lojaId }
  quem.admin = { ...comum, id: await semearUsuario(db, base, { papel: 'admin_geral', rotulo: 'admin', semLoja: true }), papel: 'admin_geral', lojaId: null }
})

after(async () => {
  const motosDoTeste = sql`select id from motos where chassi like ${P + '%'}`
  await db.execute(sql`delete from transferencias where moto_id in (${motosDoTeste})`)
  await db.execute(sql`delete from garantias where moto_id in (${motosDoTeste})`)
  await db.execute(sql`delete from historico_estoque where moto_id in (${motosDoTeste})`)
  await db.execute(sql`delete from motos where chassi like ${P + '%'}`)
  await db.execute(sql`delete from modelos where modelo = ${P}`)
  await db.execute(sql`delete from usuarios where email like ${'%-' + P.toLowerCase() + '-%'}`)
  await db.execute(sql`delete from lojas where grupo_id = ${s.grupoId}`)
  await db.execute(sql`delete from grupos where id = ${s.grupoId}`)
  await db.execute(sql`delete from contas where id = ${s.contaId}`)
  for (const m of mocks) m.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

async function transferenciaPendente(motoId: string) {
  usuarioDaSessao = quem.socio
  assert.deepEqual(await transf.solicitarTransferenciaAction(motoId, s.destinoId), { ok: true, dados: undefined })
  return (await umaLinha(sql`select id from transferencias where moto_id = ${motoId} and status = 'pendente'`)).id as string
}

const estadoTransferencia = (id: string) => umaLinha(sql`
  select t.status, t.respondido_por, m.loja_id from transferencias t join motos m on m.id = t.moto_id where t.id = ${id}`)

test('aceitar transferência leva a moto para a loja de destino', async () => {
  const id = await transferenciaPendente(await novaMoto())
  await transf.aceitarTransferenciaAction(id)
  assert.deepEqual(await estadoTransferencia(id), { status: 'aceita', respondido_por: quem.socio.id, loja_id: s.destinoId })
})

test('recusar transferência deixa a moto na loja de origem, com a observação', async () => {
  const id = await transferenciaPendente(await novaMoto())
  await transf.recusarTransferenciaAction(id, 'sem espaço')
  assert.deepEqual(await estadoTransferencia(id), { status: 'recusada', respondido_por: quem.socio.id, loja_id: s.lojaId })
  assert.equal((await umaLinha(sql`select observacao from transferencias where id = ${id}`)).observacao, 'sem espaço')
})

test('aceitar de novo a transferência já aceita recusa com o motivo do banco e não muda nada', async () => {
  const id = await transferenciaPendente(await novaMoto())
  await transf.aceitarTransferenciaAction(id)
  await assert.rejects(transf.aceitarTransferenciaAction(id),
    (e: { cause?: { message?: string } }) => /não está pendente/.test(e.cause?.message ?? ''))
  assert.deepEqual(await estadoTransferencia(id), { status: 'aceita', respondido_por: quem.socio.id, loja_id: s.destinoId })
})

test('encerrar garantia fecha a garantia e devolve a moto, com a data informada', async () => {
  const motoId = await novaMoto()
  usuarioDaSessao = quem.socio
  assert.deepEqual(await garantiasActions.abrirGarantiaAction({ motoId, descricao: 'bateria', dataInicio: '2026-11-05' }), { ok: true, dados: undefined })
  const g = await umaLinha(sql`select id, data_fim::text from garantias where moto_id = ${motoId}`)
  assert.equal(g.data_fim, '2026-12-05')
  await garantiasActions.encerrarGarantiaAction(g.id, 'trocada', '2026-11-10')
  assert.deepEqual(await umaLinha(sql`select g.status, g.data_encerramento::text, g.encerrada_por, m.status as moto
    from garantias g join motos m on m.id = g.moto_id where g.id = ${g.id}`),
  { status: 'encerrada', data_encerramento: '2026-11-10', encerrada_por: quem.socio.id, moto: 'disponivel' })
})

test('alterar status da moto grava o status e o histórico com quem mudou', async () => {
  const motoId = await novaMoto('montada')
  usuarioDaSessao = quem.aux
  await alterarStatusAction(motoId, 'em_garantia', 'barulho no motor')
  assert.equal((await umaLinha(sql`select status from motos where id = ${motoId}`)).status, 'em_garantia')
  assert.deepEqual(await ultimoHistorico(motoId),
    { status_anterior: 'montada', status_novo: 'em_garantia', observacao: 'barulho no motor', usuario_id: quem.aux.id })
})

test('correção de status pelo admin grava o status e o histórico', async () => {
  const motoId = await novaMoto('montada')
  usuarioDaSessao = quem.admin
  await correcaoStatusAdminAction(motoId, 'caixa', 'montada por engano')
  assert.equal((await umaLinha(sql`select status from motos where id = ${motoId}`)).status, 'caixa')
  assert.deepEqual(await ultimoHistorico(motoId),
    { status_anterior: 'montada', status_novo: 'caixa', observacao: 'montada por engano', usuario_id: quem.admin.id })
})
