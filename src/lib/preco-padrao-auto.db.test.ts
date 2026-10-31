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
let preencherGrupos: Tabela['preencherGruposComPrecoPadrao']
let preencherConta: Tabela['preencherContaComPrecoPadrao']
let ocultarModelo: typeof import('@/lib/modelos-da-conta')['ocultarModelo']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ preencherGruposComPrecoPadrao: preencherGrupos, preencherContaComPrecoPadrao: preencherConta } = await import('@/lib/tabela-preco-padrao'))
  ;({ ocultarModelo } = await import('@/lib/modelos-da-conta'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

async function cenario(tx: Tx) {
  const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
  const modelo = (marca: string, nome: string) => linha(sql`
    insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values (${marca}, ${nome}, 'autopropelido', '1000', 'M', '32') returning id`)
  const conta = async (nome: string, marcas: string[]) => {
    const c = await linha(sql`insert into contas (nome) values (${nome}) returning id`)
    for (const m of marcas) await tx.execute(sql`insert into conta_marcas (conta_id, marca) values (${c.id}, ${m})`)
    return c
  }
  const grupo = (nome: string, cnpj: string, contaId: string) =>
    linha(sql`insert into grupos (nome, cnpj, conta_id) values (${nome}, ${cnpj}, ${contaId}) returning id`)

  const fabrica = 'Fabrica522'
  const giga = await modelo(fabrica, 'GIGAAUTO522')
  const bob = await modelo(fabrica, 'BOBAUTO522')
  const outra = await modelo('Outra522', 'OUTRAAUTO522')
  for (const [m, p] of [[giga, '10000.00'], [bob, '12000.00'], [outra, '5000.00']] as const) {
    await tx.execute(sql`insert into tabela_preco_padrao (modelo_id, preco, competencia) values (${m.id}, ${p}, '2026-10')`)
  }
  const contaA = await conta('Auto 522 A', [fabrica])
  const contaB = await conta('Auto 522 B', ['Outra522'])
  const grupoA = await grupo('Auto 522 A', '00000000052211', contaA.id)
  const grupoB = await grupo('Auto 522 B', '00000000052212', contaB.id)
  return { giga, bob, outra, contaA, contaB, grupoA, grupoB }
}

const precos = async (tx: Tx, grupoId: string) => Object.fromEntries(
  ((await tx.execute(sql`select nome, valor_minimo from precificacao where grupo_id = ${grupoId} and nome like '%AUTO522' order by nome`)) as unknown as
    { rows: { nome: string; valor_minimo: string }[] }).rows.map(r => [r.nome, r.valor_minimo]))

test('preço padrão: preenche só o vazio, nunca troca o que existe, e só modelo de marca que a Conta tem', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await tx.execute(sql`insert into precificacao (grupo_id, nome, valor_minimo) values (${c.grupoA.id}, 'BOBAUTO522', '11111.00')`)

    const n = await preencherGrupos([c.grupoA.id], tx)
    assert.equal(n, 1)
    // OUTRAAUTO522 é de marca que a Conta A não tem: fica sem preço.
    assert.deepEqual(await precos(tx, c.grupoA.id), { BOBAUTO522: '11111.00', GIGAAUTO522: '10000.00' })

    // Rodar de novo não muda nada (nunca atualiza linha existente).
    assert.equal(await preencherGrupos([c.grupoA.id], tx), 0)
    throw new Desfazer()
  }), Desfazer)
})

test('preço padrão: preencher a Conta A não cria nada no grupo da B, e a B só recebe a marca dela', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await preencherConta(c.contaA.id, tx)
    assert.deepEqual(await precos(tx, c.grupoB.id), {})

    await preencherConta(c.contaB.id, tx)
    assert.deepEqual(await precos(tx, c.grupoB.id), { OUTRAAUTO522: '5000.00' })
    assert.deepEqual(await precos(tx, c.grupoA.id), { BOBAUTO522: '12000.00', GIGAAUTO522: '10000.00' })
    throw new Desfazer()
  }), Desfazer)
})

test('preço padrão: modelo oculto não recebe; ao voltar a ficar visível, recebe', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    await ocultarModelo(c.contaA.id, c.giga.id, true, tx)
    await preencherConta(c.contaA.id, tx)
    assert.deepEqual(await precos(tx, c.grupoA.id), { BOBAUTO522: '12000.00' })

    await ocultarModelo(c.contaA.id, c.giga.id, false, tx)
    await preencherConta(c.contaA.id, tx)
    assert.deepEqual(await precos(tx, c.grupoA.id), { BOBAUTO522: '12000.00', GIGAAUTO522: '10000.00' })
    throw new Desfazer()
  }), Desfazer)
})

test('preço padrão: preencher um grupo (Entrada, grupo novo) não mexe no outro grupo da mesma Conta', async () => {
  await assert.rejects(db.transaction(async tx => {
    const c = await cenario(tx)
    const outro = ((await tx.execute(sql`insert into grupos (nome, cnpj, conta_id) values ('Auto 522 A2', '00000000052213', ${c.contaA.id}) returning id`)) as unknown as { rows: { id: string }[] }).rows[0]
    await preencherGrupos([outro.id], tx)
    assert.deepEqual(await precos(tx, outro.id), { BOBAUTO522: '12000.00', GIGAAUTO522: '10000.00' })
    assert.deepEqual(await precos(tx, c.grupoA.id), {})
    throw new Desfazer()
  }), Desfazer)
})

test('preço padrão: Conta sem nenhuma marca marcada não recebe; ao marcar a marca do modelo, recebe', async () => {
  await assert.rejects(db.transaction(async tx => {
    await cenario(tx)
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaC = await linha(sql`insert into contas (nome) values ('Auto 522 C') returning id`)
    const grupoC = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Auto 522 C', '00000000052214', ${contaC.id}) returning id`)

    // Sem conta_marcas a Conta vê o catálogo inteiro (#287), mas não recebe a tabela padrão.
    assert.equal(await preencherConta(contaC.id, tx), 0)
    assert.deepEqual(await precos(tx, grupoC.id), {})

    await tx.execute(sql`insert into conta_marcas (conta_id, marca) values (${contaC.id}, 'Fabrica522')`)
    await preencherConta(contaC.id, tx)
    assert.deepEqual(await precos(tx, grupoC.id), { BOBAUTO522: '12000.00', GIGAAUTO522: '10000.00' })
    throw new Desfazer()
  }), Desfazer)
})
