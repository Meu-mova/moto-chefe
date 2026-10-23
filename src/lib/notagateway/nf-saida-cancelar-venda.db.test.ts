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
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let vendaTemNfViva: typeof import('@/lib/notagateway/nf-viva')['vendaTemNfViva']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ vendaTemNfViva } = await import('@/lib/notagateway/nf-viva'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [grupo] = await linhas(tx, sql`with c as (insert into contas (nome) values (${'NF347 ' + nome}) returning id)
    insert into grupos (nome, cnpj, conta_id) select ${'NF347 ' + nome}, ${cnpj}, id from c returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja NF347 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [vend] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Vend', ${'vend347' + nome + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'NF347' + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  return { grupoId: grupo.id as string, lojaId: loja.id as string, vendId: vend.id as string, modeloId: modelo.id as string }
}

async function semearVenda(tx: Tx, c: Awaited<ReturnType<typeof semearConta>>, chassi: string) {
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${chassi}, ${c.modeloId}, ${c.lojaId}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
  const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${c.lojaId}, ${c.vendId}) returning id`)
  const [venda] = await linhas(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
    values (${pedido.id}, ${moto.id}, ${c.lojaId}, ${c.vendId}, ${c.vendId}, 'Cliente', '52998224725', 1000, 'pix') returning id, numero`)
  return { id: venda.id as string, numero: venda.numero as number }
}

async function semearNota(tx: Tx, venda: { id: string, numero: number }, grupoId: string, idExterno: string, status: string) {
  const [nota] = await linhas(tx, sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, payload)
    values (${venda.id}, ${venda.numero}, ${grupoId}, ${idExterno}, 'Producao', ${status}, '{}'::jsonb) returning id`)
  return nota.id as string
}

test('apagar a venda mantém a NF Negada e a Cancelada, com o número da venda (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const conta = await semearConta(tx, 'A', '00000000034701')
    const venda = await semearVenda(tx, conta, 'NF347NEG')
    const negada = await semearNota(tx, venda, conta.grupoId, 'NF347-NEG', 'Negada')
    const cancelada = await semearNota(tx, venda, conta.grupoId, 'NF347-CAN', 'Cancelada')
    // Carta de correção da nota cancelada: antes, a NF apagada em cascata estourava esta FK.
    await linhas(tx, sql`insert into notas_fiscais_saida_cartas (nota_id, grupo_id, id_externo, ambiente, numero, correcao)
      values (${cancelada}, ${conta.grupoId}, 'NF347-CCE', 'Producao', 1, 'texto da correção com mais de quinze')`)

    assert.equal(await vendaTemNfViva(tx, venda.id), false, 'Negada e Cancelada não travam o cancelamento')
    await tx.execute(sql`delete from vendas where id = ${venda.id}`)

    const restantes = await linhas(tx, sql`select id, venda_id, venda_numero, grupo_id from notas_fiscais_saida where id in (${negada}, ${cancelada}) order by id_externo`)
    assert.equal(restantes.length, 2)
    for (const n of restantes) {
      assert.equal(n.venda_id, null)
      assert.equal(n.venda_numero, venda.numero)
      assert.equal(n.grupo_id, conta.grupoId)
    }
  })
})

test('NF viva em produção trava o cancelamento só da própria venda (#347, ADR-0014)', async () => {
  await emTransacaoDesfeita(async tx => {
    const contaA = await semearConta(tx, 'VA', '00000000034702')
    const contaB = await semearConta(tx, 'VB', '00000000034703')
    const vendaA = await semearVenda(tx, contaA, 'NF347VIVA')
    const vendaB = await semearVenda(tx, contaB, 'NF347VIVB')
    await semearNota(tx, vendaA, contaA.grupoId, 'NF347-AUT', 'Autorizada')

    assert.equal(await vendaTemNfViva(tx, vendaA.id), true)
    assert.equal(await vendaTemNfViva(tx, vendaB.id), false, 'a NF da Conta A não trava venda da Conta B')

    // Apagar a venda da B não toca na NF da A.
    await tx.execute(sql`delete from vendas where id = ${vendaB.id}`)
    const [daA] = await linhas(tx, sql`select venda_id from notas_fiscais_saida where id_externo = 'NF347-AUT'`)
    assert.equal(daA.venda_id, vendaA.id)
  })
})

test('NF de saída sem o número da venda não grava (#347)', async () => {
  await emTransacaoDesfeita(async tx => {
    const conta = await semearConta(tx, 'N', '00000000034704')
    const venda = await semearVenda(tx, conta, 'NF347SEMNUM')
    await assert.rejects(tx.execute(sql`insert into notas_fiscais_saida (venda_id, grupo_id, id_externo, ambiente, payload)
      values (${venda.id}, ${conta.grupoId}, 'NF347-SEM', 'Producao', '{}'::jsonb)`),
      (err: Error & { cause?: { column?: string } }) => err.cause?.column === 'venda_numero')
  })
})
