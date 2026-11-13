// Teste de banco: a importação dos relatórios da Cielo, da Rede e da Rendimento pela Server Action de verdade, contra o
// Postgres descartável. Só a fronteira de fora é simulada: sessão, cookie do grupo ativo e
// revalidatePath. O usuário do admin_rede vem do `usuarioDaRede` real, como em produção.
import { after, afterEach, before, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearGrupo, semearUsuario, type Base } from '@/test/semear-conta'
import { montarRelatorioCielo, vendaCielo, type LinhaCielo } from '@/test/relatorio-cielo-sintetico'
import { montarRelatorioRede, parcelaRede, vendaParceladaRede, type LinhaRede } from '@/test/relatorio-rede-sintetico'
import { montarRelatorioRendimento, operacaoRendimento, type LinhaRendimento } from '@/test/relatorio-rendimento-sintetico'

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
  assert.deepEqual(r, { ok: true, dados: { importadas: 2, duplicadas: 0, conciliadas: 0, semCodigo: 1, incompletas: 0 } })
  assert.deepEqual((await gravadasDoGrupo(b.grupoId)).map(l => l.nsu), [cod(1), cod(3)])

  const de_novo = await importar(arquivo)
  assert.deepEqual(de_novo, { ok: true, dados: { importadas: 0, duplicadas: 2, conciliadas: 0, semCodigo: 1, incompletas: 0 } })
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

// ── Rede (#857) ──────────────────────────────────────────────────────────────

async function contaComRede() {
  const suf = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'CR857', nome: suf, cnpj: suf })
  await db.execute(sql`insert into maquininhas (grupo_id, nome, operadora) values (${base.grupoId}, 'Rede', 'rede')`)
  return base
}
async function importarRede(linhasDoRelatorio: LinhaRede[]) {
  const fd = new FormData()
  fd.set('operadora', 'rede')
  fd.set('file', new File([montarRelatorioRede(linhasDoRelatorio)], 'rede.csv'))
  return actions.importarRelatorioAction(fd)
}
// NSU/CV e estabelecimento só deste teste: o banco é compartilhado entre os arquivos do test:db.
const nsuUnico = () => String(Math.floor(10000000 + Math.random() * 89999999))

test('Rede: parcelas viram uma venda; incompleta fica de fora e é contada; reimportar não duplica', async () => {
  const b = await contaComRede()
  usuario = socio(b)
  const [n1, n2] = [nsuUnico(), nsuUnico()]
  const arquivo = [...vendaParceladaRede(3, { 'NSU/CV': n1 }), ...vendaParceladaRede(2, { 'NSU/CV': n2 }).slice(0, 1)]
  const r = await importarRede(arquivo)
  assert.deepEqual(r, { ok: true, dados: { importadas: 1, duplicadas: 0, conciliadas: 0, semCodigo: 0, incompletas: 1 } })
  const gravadas = await linhas<{ nsu: string; valor_bruto: string; parcelas: number }>(
    sql`select nsu, valor_bruto, parcelas from conciliacoes_cartao where grupo_id = ${b.grupoId}`)
  assert.deepEqual(gravadas.map(g => [g.nsu, Number(g.valor_bruto), g.parcelas]), [[`2026-11-03:${n1}:123456`, 300, 3]])

  const de_novo = await importarRede(arquivo)
  assert.deepEqual(de_novo, { ok: true, dados: { importadas: 0, duplicadas: 1, conciliadas: 0, semCodigo: 0, incompletas: 1 } })
})

test('Rede, Conta A e Conta B: o mesmo NSU grava nas duas; estabelecimento de A importado em B não revela A', async () => {
  const a = await contaComRede()
  const b = await contaComRede()
  const nsu = nsuUnico()
  const estabelecimento = nsuUnico()
  usuario = socio(a)
  assert.equal((await importarRede([parcelaRede({ 'NSU/CV': nsu, estabelecimento })])).ok, true)
  usuario = socio(b)
  const r = await importarRede([parcelaRede({ 'NSU/CV': nsu, estabelecimento })])
  assert.equal(r.ok, true)
  assert.equal((await gravadasDoGrupo(a.grupoId)).length, 1)
  assert.equal((await gravadasDoGrupo(b.grupoId)).length, 1)
})

test('Rede: estabelecimento de outro grupo da MESMA Conta recusa e nada grava', async () => {
  const a1 = await contaComRede()
  const { grupoId: a2 } = await semearGrupo(db, a1.contaId, { prefixo: 'CR857', nome: `segundo-${randomUUID()}`, cnpj: randomUUID() })
  await db.execute(sql`insert into maquininhas (grupo_id, nome, operadora) values (${a2}, 'Rede', 'rede')`)
  const estabelecimento = nsuUnico()
  usuario = socio(a1)
  await importarRede([parcelaRede({ 'NSU/CV': nsuUnico(), estabelecimento })])

  usuario = socio(a1, { gruposAcesso: [a2] })
  grupoAtivoNoCookie = a2
  const r = await importarRede([parcelaRede({ 'NSU/CV': nsuUnico(), estabelecimento })])
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.erro, /outro grupo/)
  assert.equal((await gravadasDoGrupo(a2)).length, 0)
})

// ── Rendimento (#870) ────────────────────────────────────────────────────────

async function contaComRendimento() {
  const suf = randomUUID()
  const base = await semearContaBase(db, { prefixo: 'CR870', nome: suf, cnpj: suf })
  await db.execute(sql`insert into maquininhas (grupo_id, nome, operadora) values (${base.grupoId}, 'Rendimento', 'rendimento')`)
  return base
}
async function importarRendimento(linhasDoRelatorio: LinhaRendimento[]) {
  const fd = new FormData()
  fd.set('operadora', 'rendimento')
  // Codificado em latin-1, a codificação do arquivo da Rendimento: o cabeçalho tem "Código" e "Cód. Venda".
  fd.set('file', new File([Buffer.from(montarRelatorioRendimento(linhasDoRelatorio), 'latin1')], 'OperacoesCartao.csv'))
  return actions.importarRelatorioAction(fd)
}
// Código, conta e Cód. Venda só deste teste: o banco é compartilhado entre os arquivos do test:db.
const contaRendimento = () => `${nsuUnico().slice(0, 5)}-${nsuUnico().slice(0, 1)}`
const codVenda = () => randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase()

async function vendaDePecaComAutorizacao(base: Base, autorizacao: string) {
  const vendedor = await semearUsuario(db, base, { papel: 'vendedor' })
  const pagamentos = JSON.stringify([{ tipo: 'credito', valor: 3990, autorizacao }])
  const [venda] = await linhas<{ id: string }>(sql`insert into vendas_pecas (loja_id, vendedor_id, forma_pagamento, pagamentos, valor_total)
    values (${base.lojaId}, ${vendedor}, 'credito', ${pagamentos}::jsonb, 3990) returning id`)
  return venda.id
}

test('Rendimento: arquivo em latin-1 grava só as pagas com os campos do relatório; reimportar não duplica', async () => {
  const b = await contaComRendimento()
  usuario = socio(b)
  const [c1, c2, c3] = [nsuUnico(), nsuUnico(), nsuUnico()]
  const arquivo = [
    operacaoRendimento({ 'Código': c1, 'Parcelas': '0', 'Valor Total da Operação': '1.000,00', 'Valor Total a Pagar': '980,00', 'Cód. Venda': '' }),
    operacaoRendimento({ 'Código': c2, 'Status': 'Cancelado' }),
    operacaoRendimento({ 'Código': c3, 'Parcelas': '12', 'Bandeira': 'MASTERCARD', 'Cód. Venda': codVenda() }),
  ]
  const r = await importarRendimento(arquivo)
  assert.deepEqual(r, { ok: true, dados: { importadas: 2, duplicadas: 0, conciliadas: 0, semCodigo: 0, incompletas: 0 } })
  const gravadas = await linhas<{ nsu: string; operadora: string; data_transacao: string; valor_bruto: string; valor_liquido: string; parcelas: number; tipo: string; bandeira: string }>(
    sql`select nsu, operadora, data_transacao::text, valor_bruto, valor_liquido, parcelas, tipo, raw_data->>'bandeira' as bandeira
        from conciliacoes_cartao where grupo_id = ${b.grupoId} order by parcelas`)
  assert.deepEqual(gravadas.map(g => [g.nsu, g.operadora, g.data_transacao, Number(g.valor_bruto), Number(g.valor_liquido), g.parcelas, g.tipo, g.bandeira]), [
    [c1, 'rendimento', '2026-11-03', 1000, 980, 1, 'debito', 'visa'],
    [c3, 'rendimento', '2026-11-03', 3990, 3830.4, 12, 'credito', 'mastercard'],
  ])

  const de_novo = await importarRendimento(arquivo)
  assert.deepEqual(de_novo, { ok: true, dados: { importadas: 0, duplicadas: 2, conciliadas: 0, semCodigo: 0, incompletas: 0 } })
})

test('Rendimento, Conta A e Conta B: a autorização casa só com a venda da própria Conta', async () => {
  const a = await contaComRendimento()
  const b = await contaComRendimento()
  const autorizacao = codVenda()
  const vendaDeA = await vendaDePecaComAutorizacao(a, autorizacao)

  usuario = socio(b)
  const emB = await importarRendimento([operacaoRendimento({ 'Código': nsuUnico(), 'Conta': contaRendimento(), 'Cód. Venda': autorizacao })])
  assert.deepEqual(emB, { ok: true, dados: { importadas: 1, duplicadas: 0, conciliadas: 0, semCodigo: 0, incompletas: 0 } })
  const deB = await linhas<{ peca_venda_id: string | null; conciliado: boolean }>(
    sql`select peca_venda_id, conciliado from conciliacoes_cartao where grupo_id = ${b.grupoId}`)
  assert.deepEqual(deB, [{ peca_venda_id: null, conciliado: false }])

  usuario = socio(a)
  const emA = await importarRendimento([operacaoRendimento({ 'Código': nsuUnico(), 'Conta': contaRendimento(), 'Cód. Venda': autorizacao })])
  assert.deepEqual(emA, { ok: true, dados: { importadas: 0, duplicadas: 0, conciliadas: 1, semCodigo: 0, incompletas: 0 } })
  const deA = await linhas<{ peca_venda_id: string | null }>(sql`select peca_venda_id from conciliacoes_cartao where grupo_id = ${a.grupoId}`)
  assert.deepEqual(deA, [{ peca_venda_id: vendaDeA }])
})

test('Rendimento, Conta A e Conta B: o mesmo Código grava nas duas; conta da Rendimento de A importada em B não revela A (sem vermelho: já valia)', async () => {
  const a = await contaComRendimento()
  const b = await contaComRendimento()
  const codigo = nsuUnico()
  const conta = contaRendimento()
  usuario = socio(a)
  assert.equal((await importarRendimento([operacaoRendimento({ 'Código': codigo, 'Conta': conta })])).ok, true)
  usuario = socio(b)
  const r = await importarRendimento([operacaoRendimento({ 'Código': codigo, 'Conta': conta })])
  assert.deepEqual(r, { ok: true, dados: { importadas: 1, duplicadas: 0, conciliadas: 0, semCodigo: 0, incompletas: 0 } })
  assert.deepEqual((await gravadasDoGrupo(a.grupoId)).map(l => l.nsu), [codigo])
  assert.deepEqual((await gravadasDoGrupo(b.grupoId)).map(l => l.nsu), [codigo])
})

test('Rendimento: conta da Rendimento já vista em outro grupo da MESMA Conta recusa e nada grava', async () => {
  const a1 = await contaComRendimento()
  const { grupoId: a2 } = await semearGrupo(db, a1.contaId, { prefixo: 'CR870', nome: `segundo-${randomUUID()}`, cnpj: randomUUID() })
  await db.execute(sql`insert into maquininhas (grupo_id, nome, operadora) values (${a2}, 'Rendimento', 'rendimento')`)
  const conta = contaRendimento()
  usuario = socio(a1)
  await importarRendimento([operacaoRendimento({ 'Código': nsuUnico(), 'Conta': conta })])

  usuario = socio(a1, { gruposAcesso: [a2] })
  grupoAtivoNoCookie = a2
  const r = await importarRendimento([operacaoRendimento({ 'Código': nsuUnico(), 'Conta': conta })])
  assert.equal(r.ok, false)
  assert.match(r.ok ? '' : r.erro, /outro grupo/)
  assert.equal((await gravadasDoGrupo(a2)).length, 0)
})

test('Rendimento: arquivo só com operações não pagas volta recusado com o motivo, sem gravar nada', async () => {
  const b = await contaComRendimento()
  usuario = socio(b)
  const r = await importarRendimento([operacaoRendimento({ 'Código': nsuUnico(), 'Status': 'Cancelado' })])
  assert.deepEqual(r, { ok: false, erro: 'Nenhuma operação paga no arquivo. Nada foi gravado.' })
  assert.equal((await gravadasDoGrupo(b.grupoId)).length, 0)
})

test('Rendimento: grupo sem maquininha da Rendimento não importa e nada grava', async () => {
  const b = await contaComRede()   // tem maquininha, mas de outra operadora
  usuario = socio(b)
  const r = await importarRendimento([operacaoRendimento({ 'Código': nsuUnico() })])
  assert.deepEqual(r, { ok: false, erro: 'Maquininha não encontrada' })
  assert.equal((await gravadasDoGrupo(b.grupoId)).length, 0)
})
