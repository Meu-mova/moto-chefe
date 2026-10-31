// Teste de banco: Postgres descartável, como src/lib/contratos-grupo.db.test.ts.
// Local: `npm run test:db:local`. Cada caso grava numa transação desfeita no fim.
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
let m: typeof import('@/lib/motos-vendidas-sem-venda')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  m = await import('@/lib/motos-vendidas-sem-venda')
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
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'VSV ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'VSV ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja VSV ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [socio] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id)
    values (gen_random_uuid(), 'Socio', ${'socio-vsv' + nome + '@teste.invalid'}, 'admin_socio', ${loja.id}, ${conta.id}) returning id`)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('VSV', ${'VSV ' + nome}, 'autopropelido', '1000', '', '') returning id`)
  const moto = async (chassi: string, status: string, disponibilidade: string | null) =>
    (await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
      values (${chassi}, ${modelo.id}, ${loja.id}, 'PRETA', '1', ${status}::moto_status, ${disponibilidade}::disponibilidade_moto) returning id`))[0].id as string
  const vender = async (motoId: string) => {
    const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id, status)
      values (${motoId}, ${loja.id}, ${socio.id}, 'efetivado') returning id`)
    await linhas(tx, sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
      values (${pedido.id}, ${motoId}, ${loja.id}, ${socio.id}, ${socio.id}, 'Cliente', '52998224725', 1000, 'pix') returning id`)
  }
  return { contaId: conta.id as string, lojaId: loja.id as string, socioId: socio.id as string, moto, vender }
}

const estado = async (tx: Tx, id: string) =>
  (await linhas(tx, sql`select status::text, disponibilidade::text from motos where id = ${id}`))[0]

test('lista só a moto vendida sem venda da própria Conta; a busca por chassi idem', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000054401')
    const b = await semearConta(tx, 'B', '00000000054402')
    const semVenda = await a.moto('VSVA0000000000001', 'caixa', 'vendida')
    const comVenda = await a.moto('VSVA0000000000002', 'vendida', 'vendida')
    await a.vender(comVenda)
    await a.moto('VSVA0000000000003', 'montada', 'disponivel')
    await b.moto('VSVB0000000000001', 'caixa', 'vendida')

    assert.deepEqual((await m.listarMotosVendidasSemVenda(a.contaId, [a.lojaId], tx)).map(x => x.id), [semVenda])
    assert.deepEqual(await m.listarMotosVendidasSemVenda(b.contaId, [a.lojaId], tx), [], 'loja da A pedida pela B não lista nada')

    assert.equal(await m.motoVendidaSemVendaPorChassi(a.contaId, [a.lojaId], ' vsva0000000000001 ', tx), semVenda)
    assert.equal(await m.motoVendidaSemVendaPorChassi(a.contaId, [a.lojaId], 'VSVA0000000000002', tx), null, 'tem venda')
    assert.equal(await m.motoVendidaSemVendaPorChassi(b.contaId, [a.lojaId], 'VSVA0000000000001', tx), null, 'chassi da A não aparece para a B')
  })
})

test('voltar ao estoque: status caixa fica caixa, status vendida vira montada; a Conta B não mexe na moto da A', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000054401')
    const b = await semearConta(tx, 'B', '00000000054402')
    const emCaixa = await a.moto('VSVA0000000000001', 'caixa', 'vendida')
    const vendidaStatus = await a.moto('VSVA0000000000002', 'vendida', 'vendida')
    const comVenda = await a.moto('VSVA0000000000003', 'vendida', 'vendida')
    await a.vender(comVenda)

    assert.equal(await m.voltarMotoAoEstoque(b.contaId, emCaixa, b.socioId, tx), false)
    assert.deepEqual(await estado(tx, emCaixa), { status: 'caixa', disponibilidade: 'vendida' }, 'B não alterou a moto da A')

    assert.equal(await m.voltarMotoAoEstoque(a.contaId, emCaixa, a.socioId, tx), true)
    assert.deepEqual(await estado(tx, emCaixa), { status: 'caixa', disponibilidade: 'disponivel' })

    assert.equal(await m.voltarMotoAoEstoque(a.contaId, vendidaStatus, a.socioId, tx), true)
    assert.deepEqual(await estado(tx, vendidaStatus), { status: 'montada', disponibilidade: 'disponivel' })

    assert.equal(await m.voltarMotoAoEstoque(a.contaId, comVenda, a.socioId, tx), false, 'moto com venda não volta')
    assert.deepEqual(await estado(tx, comVenda), { status: 'vendida', disponibilidade: 'vendida' })
    assert.equal(await m.voltarMotoAoEstoque(a.contaId, '00000000-0000-0000-0000-000000000000', a.socioId, tx), false)

    const hist = await linhas(tx, sql`select count(*)::int as n from historico_estoque where moto_id in (${emCaixa}, ${vendidaStatus})`)
    assert.equal(hist[0].n, 2, 'cada volta deixa rastro no histórico')
  })
})

test('voltar ao estoque: venda que entra entre a leitura e a gravação recusa sem mexer na moto nem gravar histórico', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000054401')
    const id = await a.moto('VSVA0000000000001', 'caixa', 'vendida')
    // A venda é enfileirada na mesma conexão logo antes do update: chega ao banco entre os dois.
    // O query do Drizzle só sai no then; chamá-lo aqui é o que põe a venda na fila primeiro.
    let venda: Promise<unknown> | null = null
    const exec = {
      select: tx.select.bind(tx),
      insert: tx.insert.bind(tx),
      update: ((t: Parameters<Tx['update']>[0]) => {
        venda = tx.execute(sql`with p as (insert into pedidos_venda (moto_id, loja_id, vendedor_id, status)
            select id, loja_id, ${a.socioId}, 'efetivado' from motos where id = ${id} returning id, moto_id, loja_id)
          insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
          select p.id, p.moto_id, p.loja_id, ${a.socioId}, ${a.socioId}, 'Cliente', '52998224725', 1000, 'pix' from p`).then(r => r)
        return tx.update(t)
      }) as Tx['update'],
    }
    assert.equal(await m.voltarMotoAoEstoque(a.contaId, id, a.socioId, exec), false)
    await venda
    assert.deepEqual(await estado(tx, id), { status: 'caixa', disponibilidade: 'vendida' })
    const hist = await linhas(tx, sql`select count(*)::int as n from historico_estoque where moto_id = ${id}`)
    assert.equal(hist[0].n, 0)
  })
})
