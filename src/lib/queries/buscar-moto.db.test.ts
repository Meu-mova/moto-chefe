// Teste de banco: Postgres descartável. Detalhe da moto (/estoque/[id], #688): buscarMoto lê com a
// Conta no where. A moto de outra Conta, o id inexistente e o texto que não é id voltam null (a
// página responde o mesmo 404). A moto arquivada traz quando, por quem e o motivo; a viva, nada
// disso (o check motos_arquivo_completo não deixa arquivada sem quem arquivou).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearGrupo, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

const P = 'BMC688'
type Db = typeof import('@/lib/db')
let db: Db['db']
let buscarMoto: typeof import('./motos')['buscarMoto']
const semente = { contas: [] as string[], grupos: [] as string[], arquivada: '', viva: '', doOutroGrupo: '', grupoA: '', contaA: '', contaB: '', lojaB: '', redeId: '' }
const sessao = (base: { contaId: string; grupoId: string }, id = '') =>
  ({ id, papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId, grupoLiberado: null })
let socioA: ReturnType<typeof sessao>
let socioB: ReturnType<typeof sessao>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (q: ReturnType<typeof sql>) => ((await db.execute(q)) as unknown as { rows: any[] }).rows

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ buscarMoto } = await import('./motos'))
  const a = await semearContaBase(db, { prefixo: P, nome: 'A', cnpj: '00000000068851' })
  const b = await semearContaBase(db, { prefixo: P, nome: 'B', cnpj: '00000000068852' })
  // 2º grupo da Conta A: o admin_rede liberado só no 1º não o alcança.
  const a2 = await semearGrupo(db, a.contaId, { prefixo: P, nome: 'A2', cnpj: '00000000068853' })
  semente.contas.push(a.contaId, b.contaId)
  semente.grupos.push(a.grupoId, a2.grupoId, b.grupoId)
  Object.assign(semente, { grupoA: a.grupoId, contaA: a.contaId, contaB: b.contaId, lojaB: b.lojaId })
  semente.redeId = await semearUsuario(db, b, { papel: 'admin_rede', rotulo: 'rede' })
  const idA = await semearUsuario(db, a, { papel: 'admin_socio', rotulo: 'socio', nomeDoUsuario: 'Sócio A ' + P, semLoja: true, comGrupo: true })
  const idB = await semearUsuario(db, b, { papel: 'admin_socio', rotulo: 'socio', semLoja: true, comGrupo: true })
  socioA = sessao(a, idA)
  socioB = sessao(b, idB)
  const [modelo] = await linhas(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${P}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const moto = async (chassi: string, lojaId = a.lojaId) => (await linhas(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${modelo.id}, ${lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`))[0].id as string
  Object.assign(semente, { arquivada: await moto(P + 'ARQ'), viva: await moto(P + 'VIVA'), doOutroGrupo: await moto(P + 'A2', a2.lojaId) })
  await db.execute(sql`update motos set arquivada_em = '2026-11-05T02:00:00Z', arquivada_por = ${idA}, motivo_arquivo = 'golpe' where id = ${semente.arquivada}`)
})

after(async () => {
  await db.execute(sql`delete from motos where chassi like ${P + '%'}`)
  await db.execute(sql`delete from modelos where modelo = ${P}`)
  await db.execute(sql`delete from usuarios where email like ${'%-' + P.toLowerCase() + '-%'}`)
  for (const g of semente.grupos) await db.execute(sql`delete from lojas where grupo_id = ${g}`)
  for (const g of semente.grupos) await db.execute(sql`delete from grupos where id = ${g}`)
  for (const c of semente.contas) await db.execute(sql`delete from contas where id = ${c}`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('Conta B não lê a moto da Conta A: null, igual ao id inexistente e ao texto que não é id', async () => {
  assert.equal(await buscarMoto(socioB, semente.arquivada), null)
  assert.equal(await buscarMoto(socioB, semente.viva), null)
  assert.equal(await buscarMoto(socioA, '00000000-0000-0000-0000-000000000000'), null)
  assert.equal(await buscarMoto(socioA, 'nao-e-id'), null)
})

test('a Conta dona lê a arquivada com quando, quem e motivo; a viva vem sem nada disso', async () => {
  const arquivada = await buscarMoto(socioA, semente.arquivada)
  assert.equal(arquivada?.arquivadaEm?.toISOString(), '2026-11-05T02:00:00.000Z')
  assert.equal(arquivada?.arquivadaPorNome, 'Sócio A ' + P)
  assert.equal(arquivada?.motivoArquivo, 'golpe')
  const viva = await buscarMoto(socioA, semente.viva)
  assert.deepEqual([viva?.chassi, viva?.arquivadaEm, viva?.arquivadaPorNome, viva?.motivoArquivo], [P + 'VIVA', null, null, null])
})

test('admin_geral lê a moto de qualquer Conta', async () => {
  const m = await buscarMoto({ ...socioB, papel: 'admin_geral', contaId: null }, semente.viva)
  assert.equal(m?.chassi, P + 'VIVA')
})

test('admin_rede (persona real): no grupo liberado lê; outro grupo da Conta dona, em casa ou sem liberação, não', async () => {
  const { usuarioDaRede } = await import('@/lib/grupos-liberados')
  const rede = { id: semente.redeId, papel: 'admin_rede', lojaId: semente.lojaB, gruposAcesso: [], gruposAprovacao: [], contaId: semente.contaB }
  const liberados = [{ grupoId: semente.grupoA, contaId: semente.contaA }]
  const noLiberado = usuarioDaRede(rede, liberados, semente.grupoA)
  assert.equal((await buscarMoto(noLiberado, semente.viva))?.chassi, P + 'VIVA')
  assert.equal(await buscarMoto(noLiberado, semente.doOutroGrupo), null, 'outro grupo da Conta dona')
  assert.equal(await buscarMoto(usuarioDaRede(rede, liberados, null), semente.viva), null, 'em casa, sem o liberado ativo')
  assert.equal(await buscarMoto(usuarioDaRede(rede, [], semente.grupoA), semente.viva), null, 'sem liberação')
})

test('usuário sem Conta (e que não é admin_geral) não lê nada', async () => {
  assert.equal(await buscarMoto({ ...socioA, contaId: null }, semente.viva), null)
})
