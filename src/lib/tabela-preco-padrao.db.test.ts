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

type Tabela = typeof import('@/lib/tabela-preco-padrao')
let db: typeof import('@/lib/db')['db']
let carregarTabelaPadrao: Tabela['carregarTabelaPadrao']
let listarTabelaPadrao: Tabela['listarTabelaPadrao']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ carregarTabelaPadrao, listarTabelaPadrao } = await import('@/lib/tabela-preco-padrao'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

const modelo = (nome: string, contaId: string | null = null) => sql`
  insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id)
  values ('MotoChefe', ${nome}, 'autopropelido', '1000', 'M', '32', ${contaId}) returning id`

test('tabela padrão: casa só com modelo e apelido da plataforma; nada de uma Conta entra', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const conta = await linha(sql`insert into contas (nome) values ('Padrão 522 A') returning id`)
    const giga = await linha(modelo('GIGA522'))
    const vasco = await linha(modelo('VASCO522'))
    const jet = await linha(modelo('JETMAX522'))
    await linha(modelo('PROPRIO522', conta.id))
    // Apelido aprendido pela Conta num modelo da plataforma (#476) é dela, não da plataforma.
    await tx.execute(sql`insert into modelo_apelidos (apelido, modelo_id, conta_id) values ('DAQUELA522', ${jet.id}, ${conta.id})`)
    await tx.execute(sql`insert into modelo_apelidos (apelido, modelo_id, conta_id) values ('JATO522', ${jet.id}, null)`)

    const r = await carregarTabelaPadrao({
      matriz: [
        ['MODELO', 'PIX', '12X', '18X', '21X'],
        ['GIGA522/VASCO522 (1000W)', 'R$ 10.000,00', 1, 1, 1],
        ['JATO522', 12000, 1, 1, 1],
        ['PROPRIO522', 9000, 1, 1, 1],
        ['DAQUELA522', 8000, 1, 1, 1],
      ],
      competencia: '2026-10',
      usuarioId: null,
    }, tx)
    assert.equal(r.ok, true)
    assert.deepEqual(r.avisos, [
      'Linha 4 (PROPRIO522): modelo não encontrado',
      'Linha 5 (DAQUELA522): modelo não encontrado',
    ])

    const precos = new Map((await listarTabelaPadrao(tx)).map(l => [l.modeloId, l.preco]))
    assert.deepEqual([precos.get(giga.id), precos.get(vasco.id), precos.get(jet.id)], ['10000.00', '10000.00', '12000.00'])
    assert.equal(precos.size, 3)
    throw new Desfazer()
  }), Desfazer)
})

test('tabela padrão: a carga nova troca a tabela inteira; planilha sem colunas não apaga nada', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const giga = await linha(modelo('GIGA522'))
    const bob = await linha(modelo('BOB522'))
    await carregarTabelaPadrao({ matriz: [['MODELO', 'PIX'], ['GIGA522', 1], ['BOB522', 2]], competencia: '2026-10', usuarioId: null }, tx)

    const ruim = await carregarTabelaPadrao({ matriz: [['NOME', '12X'], ['GIGA522', 5]], competencia: '2026-11', usuarioId: null }, tx)
    assert.equal(ruim.ok, false)
    assert.equal((await listarTabelaPadrao(tx)).length, 2)

    const matriz = [['MODELO', 'PREÇO'], ['GIGA522', 3], ['SUMIU522', 4]]
    // 1 de 2 modelos: queda grande pede confirmação e não troca nada.
    const semConfirmar = await carregarTabelaPadrao({ matriz, competencia: '2026-11', usuarioId: null }, tx)
    assert.deepEqual(semConfirmar, {
      ok: false, confirmar: true, anteriores: 2, gravados: 1, avisos: ['Linha 3 (SUMIU522): modelo não encontrado'],
    })
    assert.equal((await listarTabelaPadrao(tx)).length, 2)

    const nova = await carregarTabelaPadrao({ matriz, competencia: '2026-11', usuarioId: null, confirmarQueda: true }, tx)
    assert.deepEqual(nova.ok && [nova.anteriores, nova.gravados], [2, 1])
    const depois = await listarTabelaPadrao(tx)
    assert.deepEqual(depois.map(l => [l.modeloId, l.preco, l.competencia]), [[giga.id, '3.00', '2026-11']])
    assert.ok(!depois.some(l => l.modeloId === bob.id))
    throw new Desfazer()
  }), Desfazer)
})
