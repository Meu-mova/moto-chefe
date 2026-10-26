// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/pedido-venda.db.test.ts.
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
let db: Db['db']
let listarNotasEmitidas: typeof import('@/lib/queries/notas-emitidas')['listarNotasEmitidas']
let contarPorCategoria: typeof import('@/lib/queries/notas-emitidas')['contarPorCategoria']
let notasParaBaixar: typeof import('@/lib/queries/notas-emitidas')['notasParaBaixar']
let HOJE: { de: string; ate: string }

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarNotasEmitidas, notasParaBaixar, contarPorCategoria } = await import('@/lib/queries/notas-emitidas'))
  const hoje = (await import('@/lib/data-venda')).hojeBrt()
  HOJE = { de: hoje, ate: hoje }
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('Notas Emitidas: a Conta B não vê nota da Conta A, e cada lista fica no grupo e no ambiente (#348)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'N348', 'autopropelido', '1000', 'hub', '32') returning id`)
    const ids: Record<string, { conta: string; grupo: string; venda: number }> = {}
    for (const [nome, cnpj] of [['A', '00000000034801'], ['B', '00000000034802']] as const) {
      const conta = await linha(sql`insert into contas (nome) values (${'Notas 348 ' + nome}) returning id`)
      const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Notas 348 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
      const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja 348 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
      const vendedor = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), ${'Vend 348 ' + nome}, ${'vend348' + nome + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
      const moto = await linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade) values (${'NOTAS348' + nome}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
      const pedido = await linha(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${loja.id}, ${vendedor.id}) returning id`)
      const venda = await linha(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
        values (${pedido.id}, ${moto.id}, ${loja.id}, ${vendedor.id}, ${vendedor.id}, ${'Cliente ' + nome}, '52998224725', 10000, 'pix') returning id, numero`) as unknown as { id: string; numero: number }
      for (const [status, ambiente, nf] of [['Autorizada', 'Producao', '1'], ['Negada', 'Producao', '2'], ['Autorizada', 'Homologacao', '3']]) {
        await tx.execute(sql`insert into notas_fiscais_saida (venda_id, grupo_id, id_externo, ambiente, status, numero, serie, payload)
          values (${venda.id}, ${grupo.id}, ${'ext348' + nome + nf}, ${ambiente}, ${status}, ${nome + nf}, '1', '{}'::jsonb)`)
      }
      if (nome === 'A') {
        await tx.execute(sql`insert into notas_fiscais_saida (venda_id, grupo_id, id_externo, ambiente, status, numero, serie, payload, criado_em)
          values (${venda.id}, ${grupo.id}, 'ext348A4', 'Producao', 'Cancelada', 'A4', '1', '{}'::jsonb, '2026-09-30T02:30:00Z'::timestamptz)`)
      }
      ids[nome] = { conta: conta.id, grupo: grupo.id, venda: venda.numero }
    }

    const daB = await listarNotasEmitidas({ grupoId: ids.B.grupo, contaId: ids.B.conta, ambiente: 'Producao', ...HOJE }, tx)
    assert.deepEqual(daB.map(n => [n.numero, n.categoria, n.vendaNumero, n.clienteNome, n.chassi]).sort(),
      [['B1', 'autorizada', ids.B.venda, 'Cliente B', 'NOTAS348B'], ['B2', 'recusada', ids.B.venda, 'Cliente B', 'NOTAS348B']])

    // Grupo da A pedido com a Conta da B (cookie adulterado, por exemplo): nada volta.
    assert.deepEqual(await listarNotasEmitidas({ grupoId: ids.A.grupo, contaId: ids.B.conta, ambiente: 'Producao', ...HOJE }, tx), [])

    const homologacaoA = await listarNotasEmitidas({ grupoId: ids.A.grupo, contaId: ids.A.conta, ambiente: 'Homologacao', ...HOJE }, tx)
    assert.deepEqual(homologacaoA.map(n => n.numero), ['A3'])

    // admin_geral (sem Conta): continua preso ao grupo pedido.
    const geral = await listarNotasEmitidas({ grupoId: ids.A.grupo, contaId: null, ambiente: 'Producao', ...HOJE }, tx)
    assert.deepEqual(geral.map(n => n.numero).sort(), ['A1', 'A2'])
    // A A4 saiu às 23h30 de 29/09 em Brasília (02h30 de 30/09 em UTC): conta no dia 29, não no 30.
    const periodo = (de: string, ate: string) => listarNotasEmitidas({ grupoId: ids.A.grupo, contaId: ids.A.conta, ambiente: 'Producao', de, ate }, tx)
    assert.deepEqual((await periodo('2026-09-29', '2026-09-29')).map(n => n.numero), ['A4'])
    assert.deepEqual(await periodo('2026-09-30', '2026-09-30'), [])

    // Download (#402): a Conta B marca o id de uma nota da A (URL adulterada): nada volta, nem misturado às dela.
    const [a1] = await periodo(HOJE.de, HOJE.ate).then(ns => ns.filter(n => n.numero === 'A1'))
    const [b1] = daB.filter(n => n.numero === 'B1')
    assert.deepEqual(await notasParaBaixar({ grupoId: ids.B.grupo, contaId: ids.B.conta, ambiente: 'Producao', ...HOJE }, { situacao: 'todas', ids: [a1.id] }, tx), [])
    assert.deepEqual((await notasParaBaixar({ grupoId: ids.B.grupo, contaId: ids.B.conta, ambiente: 'Producao', ...HOJE }, { situacao: 'todas', ids: [a1.id, b1.id] }, tx)).map(n => n.numero), ['B1'])
    // Grupo da A com a Conta da B: nem o filtro nem a seleção devolvem nota.
    assert.deepEqual(await notasParaBaixar({ grupoId: ids.A.grupo, contaId: ids.B.conta, ambiente: 'Producao', ...HOJE }, { situacao: 'todas', ids: [a1.id] }, tx), [])
    assert.deepEqual(await notasParaBaixar({ grupoId: ids.A.grupo, contaId: ids.B.conta, ambiente: 'Producao', ...HOJE }, { situacao: 'todas', ids: [] }, tx), [])

    // Contagem da tela (#402): não tem o teto da lista e também fica presa à Conta.
    assert.deepEqual(await contarPorCategoria({ grupoId: ids.B.grupo, contaId: ids.B.conta, ambiente: 'Producao', ...HOJE }, tx),
      { autorizada: 1, cancelada: 0, recusada: 1, em_andamento: 0, descartada: 0 })
    assert.deepEqual(await contarPorCategoria({ grupoId: ids.A.grupo, contaId: ids.B.conta, ambiente: 'Producao', ...HOJE }, tx),
      { autorizada: 0, cancelada: 0, recusada: 0, em_andamento: 0, descartada: 0 })
    throw new Desfazer()
  }), Desfazer)
})

test('Notas Emitidas: o download do filtro passa do teto de 500 da lista (#402)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const conta = await linha(sql`insert into contas (nome) values ('Notas 402') returning id`)
    const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Notas 402', '00000000040201', ${conta.id}) returning id`)
    // venda_id nulo: a nota sobrevive à venda cancelada (0144).
    await tx.execute(sql`insert into notas_fiscais_saida (grupo_id, venda_numero, id_externo, ambiente, status, numero, serie, payload)
      select ${grupo.id}, i, 'ext402-' || i, 'Producao', 'Autorizada', i::text, '1', '{}'::jsonb from generate_series(1, 501) i`)
    const filtro = { grupoId: grupo.id, contaId: conta.id, ambiente: 'Producao' as const, ...HOJE }
    assert.equal((await listarNotasEmitidas(filtro, tx)).length, 500)
    assert.equal((await notasParaBaixar(filtro, { situacao: 'todas', ids: [] }, tx)).length, 501)
    throw new Desfazer()
  }), Desfazer)
})
