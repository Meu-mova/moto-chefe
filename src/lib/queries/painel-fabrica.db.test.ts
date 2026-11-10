// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
// As consultas usam o db global (sem transação): os dados são gravados de verdade e
// apagados no after. Toda conferência filtra pelas lojas deste teste (os arquivos do
// test:db rodam em paralelo no mesmo banco).
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
type Painel = typeof import('@/lib/queries/painel-fabrica')
let db: Db['db']
let execRows: Db['execRows']
let painel: Painel

// a: Conta A, loja MotoChefe · b: Conta B, loja MotoChefe · semPortal: Conta A, sem login da
// fábrica · desativada: Conta C desativada, com login · inativa: Conta A, loja inativa.
type Chave = 'a' | 'b' | 'semPortal' | 'desativada' | 'inativa'
const lojas = {} as Record<Chave, string>
const contas: string[] = []
const modelos = { mc: '', voi: '' }
const CNPJS = ['00000000081901', '00000000081902', '00000000081903']

const linha = async (q: ReturnType<typeof sql>) => (await execRows(q))[0] as { id: string }
const nossas = <T extends { lojaId: string }>(l: T[]) => l.filter(x => Object.values(lojas).includes(x.lojaId))

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  painel = await import('@/lib/queries/painel-fabrica')

  modelos.mc = (await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('MotoChefe', ' x819 ', 'autopropelido', '1000', '', '') returning id`)).id
  modelos.voi = (await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('Voi', 'VOI819', 'autopropelido', '1000', '', '') returning id`)).id

  const grupoNovo = async (nome: string, cnpj: string, desativada = false) => {
    const conta = await linha(sql`insert into contas (nome, desativada_em) values (${nome}, ${desativada ? sql`now()` : null}) returning id`)
    contas.push(conta.id)
    return (await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${nome}, ${cnpj}, ${conta.id}) returning id`)).id
  }
  const gA = await grupoNovo('Painel 819 A', CNPJS[0])
  const gB = await grupoNovo('Painel 819 B', CNPJS[1])
  const gC = await grupoNovo('Painel 819 C', CNPJS[2], true)
  const lojaNova = async (nome: string, grupo: string, portal: string | null, ativa = true) =>
    (await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id, fabrica_email, ativa) values (${nome}, 'C', 'R', ${grupo}, ${portal}, ${ativa}) returning id`)).id
  lojas.a = await lojaNova('Loja 819 A', gA, 'a819@teste.invalid')
  lojas.b = await lojaNova('Loja 819 B', gB, 'b819@teste.invalid')
  lojas.semPortal = await lojaNova('Loja 819 Sem Portal', gA, '  ')
  lojas.desativada = await lojaNova('Loja 819 Desativada', gC, 'c819@teste.invalid')
  lojas.inativa = await lojaNova('Loja 819 Inativa', gA, 'i819@teste.invalid', false)

  let seq = 0
  const moto = async (loja: string, modelo: string, cor: string, extra: { vendida?: boolean; arquivada?: boolean; garantia?: boolean } = {}) =>
    (await linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade, arquivada_em, somente_garantia)
      values (${'PAINEL819' + seq++}, ${modelo}, ${loja}, ${cor}, '1', ${extra.vendida ? 'vendida' : 'disponivel'},
              ${extra.vendida ? 'vendida' : 'disponivel'}, ${extra.arquivada ? sql`now()` : null}, ${extra.garantia ?? false}) returning id`)).id

  // Estoque: A tem 2 PRETO + 1 branco (grafia solta) da MotoChefe e 3 Voi; B tem 1 PRETO.
  await moto(lojas.a, modelos.mc, 'PRETO')
  await moto(lojas.a, modelos.mc, 'PRETO')
  await moto(lojas.a, modelos.mc, ' branco ')
  for (let i = 0; i < 3; i++) await moto(lojas.a, modelos.voi, 'PRETO')
  await moto(lojas.b, modelos.mc, 'PRETO')
  // Fora do estoque: arquivada, só garantia, e lojas que não são do painel.
  await moto(lojas.a, modelos.mc, 'PRETO', { arquivada: true })
  await moto(lojas.a, modelos.mc, 'PRETO', { garantia: true })
  for (const l of [lojas.semPortal, lojas.desativada, lojas.inativa]) await moto(l, modelos.mc, 'PRETO')

  // Vendas: em 15/10 (dentro), uma Voi (fora pela marca), uma em 01/11 00:30 de Brasília
  // (fora do período de outubro) e uma na loja sem portal.
  const vender = async (loja: string, modelo: string, quando: string) => {
    const motoId = await moto(loja, modelo, 'PRETO', { vendida: true })
    const vendedor = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), 'Vend 819', ${'vend819-' + seq + '@teste.invalid'}, 'vendedor', ${loja}) returning id`)
    const pedido = await linha(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${motoId}, ${loja}, ${vendedor.id}) returning id`)
    await db.execute(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, numero, data_venda)
      values (${pedido.id}, ${motoId}, ${loja}, ${vendedor.id}, ${vendedor.id}, 'Cliente', '52998224725', 1000, 'pix', ${981900 + seq}, ${quando}::timestamptz)`)
  }
  await vender(lojas.a, modelos.mc, '2026-10-15T15:00:00Z')
  await vender(lojas.a, modelos.mc, '2026-10-31T23:00:00Z') // 20h de 31/10 em Brasília: dentro
  await vender(lojas.b, modelos.mc, '2026-10-20T15:00:00Z')
  await vender(lojas.a, modelos.voi, '2026-10-15T15:00:00Z')
  await vender(lojas.a, modelos.mc, '2026-11-01T03:30:00Z') // 00:30 de 01/11 em Brasília: fora
  await vender(lojas.semPortal, modelos.mc, '2026-10-15T15:00:00Z')
})

after(async () => {
  const ids = sql.join(Object.values(lojas).map(i => sql`${i}`), sql`, `)
  await db.execute(sql`delete from vendas where loja_id in (${ids})`)
  await db.execute(sql`delete from pedidos_venda where loja_id in (${ids})`)
  await db.execute(sql`delete from motos where loja_id in (${ids})`)
  await db.execute(sql`delete from usuarios where email like 'vend819-%@teste.invalid'`)
  await db.execute(sql`delete from modelos where id in (${modelos.mc}, ${modelos.voi})`)
  await db.execute(sql`delete from lojas where id in (${ids})`)
  await db.execute(sql`delete from grupos where cnpj in (${sql.join(CNPJS.map(c => sql`${c}`), sql`, `)})`)
  await db.execute(sql`delete from contas where id in (${sql.join(contas.map(i => sql`${i}`), sql`, `)})`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

test('lojas do painel: as duas Contas com portal; sem portal, inativa e de Conta desativada ficam fora', async () => {
  const ids = nossas(await painel.listarLojasDoPainel()).map(l => l.lojaId).sort()
  assert.deepEqual(ids, [lojas.a, lojas.b].sort())
})

test('estoque: só MotoChefe no showroom, somado por loja × modelo × cor; a Voi não aparece', async () => {
  const e = nossas(await painel.estoqueDoPainel())
    .map(l => [l.lojaId === lojas.a ? 'a' : 'b', l.modelo, l.cor, l.quantidade])
    .sort((x, y) => String(x).localeCompare(String(y)))
  assert.deepEqual(e, [['a', 'X819', 'BRANCO', 1], ['a', 'X819', 'PRETO', 2], ['b', 'X819', 'PRETO', 1]])
  assert.ok(!e.some(l => l[1] === 'VOI819'), 'Voi nunca entra')
})

test('vendas: dias de Brasília, só MotoChefe e só lojas do painel', async () => {
  const v = nossas(await painel.vendasDoPainel('2026-10-01', '2026-10-31'))
    .map(l => [l.lojaId === lojas.a ? 'a' : 'b', l.modelo, l.quantidade])
    .sort((x, y) => String(x).localeCompare(String(y)))
  assert.deepEqual(v, [['a', 'X819', 2], ['b', 'X819', 1]])
  const nov = nossas(await painel.vendasDoPainel('2026-11-01', '2026-11-01'))
  assert.deepEqual(nov.map(l => l.quantidade), [1])
})
