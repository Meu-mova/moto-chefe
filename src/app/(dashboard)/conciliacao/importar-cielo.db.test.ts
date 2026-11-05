// Teste de banco: a importação do relatório da Cielo pela Server Action de verdade, contra o
// Postgres descartável. Só a fronteira de fora é simulada: sessão, cookie do grupo ativo e
// revalidatePath. O usuário do admin_rede vem do `usuarioDaRede` real, como em produção.
import { after, afterEach, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearGrupo } from '@/test/semear-conta'
import { montarRelatorioCielo, vendaCielo, type LinhaCielo } from '@/test/relatorio-cielo-sintetico'

const url = process.env.TEST_DATABASE_URL
if (!url || !['localhost', '127.0.0.1'].includes(new URL(url).hostname)) throw new Error('Use somente Postgres descartável local')
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Sessao = { id: string; papel: string; lojaId: string | null; contaId: string | null; gruposAcesso: string[]; gruposAprovacao: string[] }
let db: Db['db']
let actions: typeof import('./actions')
let usuario: Sessao
let grupoAtivoNoCookie: string | null = null

const authMock = mock.module('@/lib/auth', { namedExports: { getUsuarioLogado: async () => usuario } })
const cacheMock = mock.module('next/cache', { namedExports: { revalidatePath: () => {} } })
const headersMock = mock.module('next/headers', {
  namedExports: { cookies: async () => ({ get: (n: string) => (n === 'grupoAtivo' && grupoAtivoNoCookie ? { value: grupoAtivoNoCookie } : undefined) }) },
})

before(async () => {
  ;({ db } = await import('@/lib/db'))
  actions = await import('./actions')
})
afterEach(() => { grupoAtivoNoCookie = null })
after(async () => {
  authMock.restore(); cacheMock.restore(); headersMock.restore()
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

async function linhas<T>(q: ReturnType<typeof sql>): Promise<T[]> {
  return ((await db.execute(q)) as unknown as { rows: T[] }).rows
}

// Conta nova com grupo, loja e maquininha Cielo cadastrada (a Cielo só importa com ela).
async function contaComCielo() {
  const suf = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'CC656', nome: suf, cnpj: suf })
  await db.execute(sql`insert into maquininhas (grupo_id, nome, operadora) values (${base.grupoId}, 'Cielo', 'cielo')`)
  return base
}
const socio = (b: { contaId: string; lojaId: string }, extra: Partial<Sessao> = {}): Sessao =>
  ({ id: randomUUID(), papel: 'admin_socio', lojaId: b.lojaId, contaId: b.contaId, gruposAcesso: [], gruposAprovacao: [], ...extra })

async function importar(linhasDoRelatorio: LinhaCielo[], opcoes: { comCabecalho?: boolean } = {}) {
  const texto = montarRelatorioCielo({ linhas: linhasDoRelatorio, ...opcoes })
  const fd = new FormData()
  fd.set('operadora', 'cielo')
  // latin-1, como o arquivo real: o caminho de decodificação da action precisa dar conta.
  fd.set('file', new File([Buffer.from(texto, 'latin1')], 'cielo.csv'))
  return actions.importarRelatorioAction(fd)
}
const gravadasDoGrupo = (grupoId: string) =>
  linhas<{ nsu: string | null; raw_data: { serial: string | null } }>(sql`select nsu, raw_data from conciliacoes_cartao where grupo_id = ${grupoId} order by nsu`)

// Código da venda e serial só deste teste: o banco é compartilhado entre os arquivos do test:db.
const codigos = () => { const p = randomUUID().replace(/\D/g, '').padEnd(10, '7').slice(0, 10); return (n: number) => `${p}${String(n).padStart(9, '0')}` }

test('sem Código da venda a linha não entra e a tela recebe quantas ficaram de fora; reimportar não duplica', async () => {
  const b = await contaComCielo()
  usuario = socio(b)
  const cod = codigos()
  const arquivo = [vendaCielo({ 'Código da venda': cod(1) }), vendaCielo({ 'Código da venda': '' }), vendaCielo({ 'Código da venda': cod(3) })]
  const r = await importar(arquivo)
  assert.deepEqual(r, { ok: true, dados: { importadas: 2, duplicadas: 0, conciliadas: 0, semCodigo: 1 } })
  assert.deepEqual((await gravadasDoGrupo(b.grupoId)).map(l => l.nsu), [cod(1), cod(3)])

  const de_novo = await importar(arquivo)
  assert.deepEqual(de_novo, { ok: true, dados: { importadas: 0, duplicadas: 2, conciliadas: 0, semCodigo: 1 } })
  assert.equal((await gravadasDoGrupo(b.grupoId)).length, 2)
})

test('arquivo recusado não grava nenhuma linha', async () => {
  const b = await contaComCielo()
  usuario = socio(b)
  const cod = codigos()
  const semCabecalho = await importar([vendaCielo({ 'Código da venda': cod(1) })], { comCabecalho: false })
  assert.equal(semCabecalho.ok, false)
  // a 2ª linha tem data impossível: a 1ª, boa, também não pode ficar gravada
  const dataRuim = await importar([vendaCielo({ 'Código da venda': cod(1) }), vendaCielo({ 'Código da venda': cod(2), 'Data da venda': '31/02/2026' })])
  assert.equal(dataRuim.ok, false)
  assert.equal((await gravadasDoGrupo(b.grupoId)).length, 0)
})

test('admin_rede (persona real) importa no grupo liberado; em grupo não liberado, nada grava (sem vermelho: já valia)', async () => {
  const { usuarioDaRede } = await import('@/lib/grupos-liberados')
  const casa = await contaComCielo()
  const liberado = await contaComCielo()
  const naoLiberado = await contaComCielo()
  const rede = { id: randomUUID(), papel: 'admin_rede', lojaId: casa.lojaId, contaId: casa.contaId, gruposAcesso: [] as string[], gruposAprovacao: [] as string[] }
  const vivos = [{ grupoId: liberado.grupoId, contaId: liberado.contaId }]
  const cod = codigos()

  grupoAtivoNoCookie = liberado.grupoId
  usuario = usuarioDaRede(rede, vivos, grupoAtivoNoCookie)
  const noLiberado = await importar([vendaCielo({ 'Código da venda': cod(1) })])
  assert.equal(noLiberado.ok, true)
  assert.equal((await gravadasDoGrupo(liberado.grupoId)).length, 1)
  assert.equal((await gravadasDoGrupo(casa.grupoId)).length, 0)

  grupoAtivoNoCookie = naoLiberado.grupoId
  usuario = usuarioDaRede(rede, vivos, grupoAtivoNoCookie)
  await importar([vendaCielo({ 'Código da venda': cod(2) })])
  assert.equal((await gravadasDoGrupo(naoLiberado.grupoId)).length, 0)
})

test('aux_adm continua sem permissão para importar', async () => {
  const b = await contaComCielo()
  usuario = socio(b, { papel: 'aux_adm' })
  const r = await importar([vendaCielo({ 'Código da venda': codigos()(1) })])
  assert.deepEqual(r, { ok: false, erro: 'Sem permissão' })
  assert.equal((await gravadasDoGrupo(b.grupoId)).length, 0)
})

test('Conta A e Conta B: o mesmo Código da venda grava nas duas', async () => {
  const a = await contaComCielo()
  const b = await contaComCielo()
  const cod = codigos()
  usuario = socio(a)
  assert.equal((await importar([vendaCielo({ 'Código da venda': cod(1) })])).ok, true)
  usuario = socio(b)
  assert.equal((await importar([vendaCielo({ 'Código da venda': cod(1) })])).ok, true)
  assert.equal((await gravadasDoGrupo(a.grupoId)).length, 1)
  assert.equal((await gravadasDoGrupo(b.grupoId)).length, 1)
})

test('serial da Conta A importado na Conta B: importa como serial desconhecido, sem revelar A', async () => {
  const a = await contaComCielo()
  const b = await contaComCielo()
  const cod = codigos()
  const serial = String(Math.floor(10000000 + Math.random() * 89999999))
  usuario = socio(a)
  await importar([vendaCielo({ 'Código da venda': cod(1), 'Número da máquina': serial })])
  usuario = socio(b)
  const r = await importar([vendaCielo({ 'Código da venda': cod(2), 'Número da máquina': serial })])
  assert.equal(r.ok, true)
  assert.equal((await gravadasDoGrupo(b.grupoId)).length, 1)
})

test('serial de outro grupo da MESMA Conta: recusa e nada grava', async () => {
  const a1 = await contaComCielo()
  const { grupoId: a2 } = await semearGrupo(db, a1.contaId, { prefixo: 'CC656', nome: `segundo-${randomUUID()}`, cnpj: randomUUID() })
  await db.execute(sql`insert into maquininhas (grupo_id, nome, operadora) values (${a2}, 'Cielo', 'cielo')`)
  const cod = codigos()
  const serial = String(Math.floor(10000000 + Math.random() * 89999999))
  usuario = socio(a1)
  await importar([vendaCielo({ 'Código da venda': cod(1), 'Número da máquina': serial })])

  usuario = socio(a1, { gruposAcesso: [a2] })
  grupoAtivoNoCookie = a2
  const r = await importar([vendaCielo({ 'Código da venda': cod(2), 'Número da máquina': serial })])
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.erro, /outro grupo/)
  assert.equal((await gravadasDoGrupo(a2)).length, 0)
})

test('a trava da Cielo olha só o serial: Código da venda de outro grupo que CONTÉM o número não conta', async () => {
  const a1 = await contaComCielo()
  const { grupoId: a2 } = await semearGrupo(db, a1.contaId, { prefixo: 'CC656', nome: `segundo-${randomUUID()}`, cnpj: randomUUID() })
  await db.execute(sql`insert into maquininhas (grupo_id, nome, operadora) values (${a2}, 'Cielo', 'cielo')`)
  const serial = String(Math.floor(10000000 + Math.random() * 89999999))
  // Venda do grupo a1 cujo código tem o número do outro aparelho no meio, por acaso.
  await db.execute(sql`insert into conciliacoes_cartao (grupo_id, operadora, data_transacao, nsu, valor_bruto, raw_data)
    values (${a1.grupoId}, 'cielo', '2026-11-03', ${`11${serial}0000001`}, 10, '{"serial":"00000000"}'::jsonb)`)

  usuario = socio(a1, { gruposAcesso: [a2] })
  grupoAtivoNoCookie = a2
  const r = await importar([vendaCielo({ 'Código da venda': codigos()(1), 'Número da máquina': serial })])
  assert.equal(r.ok, true)
  assert.equal((await gravadasDoGrupo(a2)).length, 1)
})
