// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
// As consultas do dashboard usam o db global (sem transação), então os dados são
// gravados de verdade e apagados no after.
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
type Dash = typeof import('@/lib/queries/dashboard')
let db: Db['db']
let execRows: Db['execRows']
let getMotoMaisVendida: Dash['getMotoMaisVendida']
let getModelosMaisVendidos: Dash['getModelosMaisVendidos']
const lojas: Record<'a' | 'b', string> = { a: '', b: '' }
const contas: string[] = []
const grupos: Record<'a' | 'b', string> = { a: '', b: '' }
let modeloId = ''

const linha = async (q: ReturnType<typeof sql>) => (await execRows(q))[0] as { id: string }

before(async () => {
  ;({ db, execRows } = await import('@/lib/db'))
  ;({ getMotoMaisVendida, getModelosMaisVendidos } = await import('@/lib/queries/dashboard'))
  const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M476', 'ORIG476', 'autopropelido', '1000', '', '') returning id`)
  modeloId = modelo.id
  // A Conta A ajusta o nome e vende 2; a B vende 1 com o nome original.
  for (const [chave, cnpj, vendidas] of [['a', '00000000047601', 2], ['b', '00000000047602', 1]] as const) {
    const conta = await linha(sql`insert into contas (nome) values (${'Dash 476 ' + chave}) returning id`)
    contas.push(conta.id)
    const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Dash 476 ' + chave}, ${cnpj}, ${conta.id}) returning id`)
    const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja 476 ' + chave}, 'C', 'R', ${grupo.id}) returning id`)
    lojas[chave] = loja.id
    grupos[chave] = grupo.id
    const vendedor = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), 'Vend 476', ${'vend476' + chave + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
    for (let i = 0; i < vendidas; i++) {
      const moto = await linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade) values (${'DASH476' + chave + i}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
      const pedido = await linha(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${loja.id}, ${vendedor.id}) returning id`)
      await db.execute(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento, numero, data_venda)
        values (${pedido.id}, ${moto.id}, ${loja.id}, ${vendedor.id}, ${vendedor.id}, 'Cliente', '52998224725', 1000, 'pix', ${947600 + (chave === 'a' ? 0 : 10) + i}, '2026-09-15T15:00:00Z'::timestamptz)`)
    }
  }
  // Em estoque, para a tela de compras.
  await db.execute(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade) values ('DASH476ESTOQUE', ${modelo.id}, ${lojas.a}, 'CINZA', '1', 'disponivel', 'disponivel')`)
  await db.execute(sql`insert into modelo_ajustes (conta_id, modelo_id, modelo) values (${contas[0]}, ${modelo.id}, 'NOME476 DA A')`)
})

after(async () => {
  const ids = Object.values(lojas)
  await db.execute(sql`delete from vendas where loja_id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`)
  await db.execute(sql`delete from pedidos_venda where loja_id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`)
  await db.execute(sql`delete from motos where loja_id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`)
  await db.execute(sql`delete from usuarios where email like 'vend476%@teste.invalid'`)
  await db.execute(sql`delete from modelo_ajustes where modelo_id = ${modeloId}`)
  await db.execute(sql`delete from modelos where id = ${modeloId}`)
  await db.execute(sql`delete from lojas where id in (${sql.join(ids.map(i => sql`${i}`), sql`, `)})`)
  await db.execute(sql`delete from grupos where cnpj in ('00000000047601', '00000000047602')`)
  await db.execute(sql`delete from contas where id in (${sql.join(contas.map(i => sql`${i}`), sql`, `)})`)
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

const setembro = (lojaId: string[]) => ({ dataInicio: '2026-09-01', dataFim: '2026-09-30', lojaId })

test('modelos mais vendidos: cada Conta vê o nome dela e a soma das partes bate com o total', async () => {
  assert.deepEqual((await getModelosMaisVendidos(setembro([lojas.a]))).map(m => [m.modelo, m.totalVendas]), [['NOME476 DA A', 2]])
  assert.deepEqual((await getModelosMaisVendidos(setembro([lojas.b]))).map(m => [m.modelo, m.totalVendas]), [['ORIG476', 1]])
  const juntas = await getModelosMaisVendidos(setembro([lojas.a, lojas.b]))
  assert.deepEqual(juntas.map(m => [m.modelo, m.totalVendas]), [['NOME476 DA A', 2], ['ORIG476', 1]], 'admin_geral: uma linha por nome')
  assert.equal(juntas.reduce((s, m) => s + m.totalVendas, 0), 3, 'nenhuma venda some nem duplica')
})

test('moto mais vendida: o nome da Conta da loja', async () => {
  assert.deepEqual(await getMotoMaisVendida(setembro([lojas.a])), { modelo: 'NOME476 DA A', total: 2 })
  assert.deepEqual(await getMotoMaisVendida(setembro([lojas.b])), { modelo: 'ORIG476', total: 1 })
})

// Estas consultas agrupam pela expressão com subconsulta: o tsc não pega SQL quebrado.
test('relatórios do mês e compras rodam e mostram o nome da Conta', async () => {
  const { dadosIndividual } = await import('@/lib/queries/individual')
  const { dadosColetiva } = await import('@/lib/queries/coletiva')
  const { dadosFechamento } = await import('@/lib/queries/fechamento')
  const { listarDadosCompras } = await import('@/lib/queries/compras')
  const mesDaA = { grupoId: grupos.a, lojaIds: [lojas.a], ano: 2026, mes: 9 }
  for (const [nome, dados] of [
    ['individual', await dadosIndividual(mesDaA)],
    ['coletiva', await dadosColetiva(mesDaA)],
    ['fechamento', await dadosFechamento(mesDaA)],
    ['compras', await listarDadosCompras(lojas.a, [lojas.a])],
  ] as const) {
    const texto = JSON.stringify(dados)
    assert.ok(texto.includes('NOME476 DA A'), `${nome}: nome ajustado da A`)
    assert.ok(!texto.includes('ORIG476'), `${nome}: sem o original`)
  }
})
