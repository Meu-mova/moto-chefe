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

type Imp = typeof import('@/lib/importar-precos')
let db: typeof import('@/lib/db')['db']
let previaDaImportacao: Imp['previaDaImportacao']
let gravarImportacao: Imp['gravarImportacao']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ previaDaImportacao, gravarImportacao } = await import('@/lib/importar-precos'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function cenario(tx: Tx) {
  const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  const modelo = (nome: string, contaId: string | null = null) => linha(sql`
    insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id)
    values ('MotoChefe', ${nome}, 'autopropelido', '1000', 'M', '32', ${contaId}) returning id`)
  const contaA = await linha(sql`insert into contas (nome) values ('Imp 522 A') returning id`)
  const contaB = await linha(sql`insert into contas (nome) values ('Imp 522 B') returning id`)
  const grupoA = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Imp 522 A', '00000000052201', ${contaA.id}) returning id`)
  const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Imp 522 B', '00000000052202', ${contaB.id}) returning id`)
  const muda = await modelo('MUDA522')
  const igual = await modelo('IGUAL522')
  const vazio = await modelo('VAZIO522')
  const daB = await modelo('SODAB522', contaB.id)
  await tx.execute(sql`insert into modelo_apelidos (apelido, modelo_id, conta_id) values ('APELIDOB522', ${vazio.id}, ${contaB.id})`)
  const prec = (grupo: string, nome: string, valor: string) => linha(sql`
    insert into precificacao (grupo_id, nome, valor_minimo) values (${grupo}, ${nome}, ${valor}) returning id`)
  await prec(grupoA.id, 'MUDA522', '100.00')
  await prec(grupoA.id, 'IGUAL522', '200.00')
  await prec(grupoB.id, 'MUDA522', '999.00')
  return { contaA, contaB, grupoA, grupoB, muda, igual, vazio, daB }
}

const planilha = [
  ['MODELO', 'PIX', '12X'],
  ['MUDA522', 150, 1],
  ['IGUAL522', 200, 1],
  ['VAZIO522', 300, 1],
  ['SODAB522', 400, 1],
  ['APELIDOB522', 500, 1],
]

test('importar preços: a prévia da Conta A não casa modelo nem apelido da B, e mostra hoje → planilha', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const p = await previaDaImportacao({ grupoId: c.grupoA.id, contaId: c.contaA.id, matriz: planilha }, tx)
    assert.equal(p.ok, true)
    if (!p.ok) return
    assert.deepEqual(p.linhas.map(l => [l.nome, l.precoAtual, l.precoNovo, l.tipo]), [
      ['MUDA522', '100.00', '150.00', 'muda'],
      ['VAZIO522', null, '300.00', 'novo'],
    ])
    assert.deepEqual(p.iguais, ['IGUAL522'])
    assert.deepEqual(p.foraDoCatalogo, ['SODAB522', 'APELIDOB522'])
    assert.deepEqual(p.foraDaImportacao, [])
    throw new Desfazer()
  }), Desfazer)
})

test('importar preços: grava o modelo vazio sempre, troca só o marcado, e o grupo B fica intocado', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const valores = async (grupo: string) => Object.fromEntries(
      ((await tx.execute(sql`select nome, valor_minimo from precificacao where grupo_id = ${grupo} order by nome`)) as unknown as { rows: { nome: string; valor_minimo: string }[] })
        .rows.map(r => [r.nome, r.valor_minimo]))

    // MUDA522 desmarcado: fica como estava; VAZIO522 entra mesmo sem estar na lista.
    const semTrocar = await gravarImportacao({ grupoId: c.grupoA.id, contaId: c.contaA.id, matriz: planilha, trocar: [] }, tx)
    assert.deepEqual(semTrocar, { ok: true, gravados: 1 })
    assert.deepEqual(await valores(c.grupoA.id), { IGUAL522: '200.00', MUDA522: '100.00', VAZIO522: '300.00' })

    // Id forjado de outro modelo (da Conta B) na lista de troca não grava nada a mais.
    const comTrocar = await gravarImportacao({ grupoId: c.grupoA.id, contaId: c.contaA.id, matriz: planilha, trocar: [c.muda.id, c.daB.id] }, tx)
    assert.deepEqual(comTrocar, { ok: true, gravados: 1 })
    assert.deepEqual(await valores(c.grupoA.id), { IGUAL522: '200.00', MUDA522: '150.00', VAZIO522: '300.00' })

    assert.deepEqual(await valores(c.grupoB.id), { MUDA522: '999.00' })
    throw new Desfazer()
  }), Desfazer)
})
