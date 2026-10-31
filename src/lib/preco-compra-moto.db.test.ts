// Teste de banco: Postgres descartável, como src/lib/entrada-pecas.db.test.ts.
// Correção do preço de compra de moto já cadastrada (#514): só sócio e admin_geral, só
// na própria Conta, nunca em moto vendida, e cada mudança fica no log com de/para.
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
let preco: typeof import('@/lib/preco-compra-moto')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  preco = await import('@/lib/preco-compra-moto')
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
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'PM514 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'PM514 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja PM514 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max)
    values ('M', ${'PM514 ' + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const usuario = async (papel: string) => {
    const [u] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
      values (gen_random_uuid(), ${papel}, ${papel + '-pm514' + nome + '@teste.invalid'}, ${papel}, ${loja.id}) returning id`)
    return { id: u.id as string, papel, lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string }
  }
  const moto = async (chassi: string, status = 'disponivel') => {
    const [m] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, preco_compra)
      values (${chassi}, ${modelo.id}, ${loja.id}, 'Preta', '123', ${status}, 6400) returning id`)
    return m.id as string
  }
  return { contaId: conta.id as string, grupoId: grupo.id as string, socio: await usuario('admin_socio'), aux: await usuario('aux_adm'), moto }
}

const precoDa = async (tx: Tx, motoId: string) => (await linhas(tx, sql`select preco_compra from motos where id = ${motoId}`))[0].preco_compra
const logs = (tx: Tx, motoId: string) =>
  linhas(tx, sql`select usuario_id, conta_id, grupo_id, detalhe from log_acoes where tipo = 'preco_compra_alterado' and detalhe->>'motoId' = ${motoId}`)

test('sócio corrige o preço da moto da própria Conta e o log grava de e para', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const motoId = await a.moto('PM514CHASSIA1')
    assert.deepEqual(await preco.corrigirPrecoCompra(a.socio, motoId, '2016.38', tx), { ok: true })
    assert.equal(await precoDa(tx, motoId), '2016.38')
    const [log] = await logs(tx, motoId)
    assert.equal(log.usuario_id, a.socio.id)
    assert.equal(log.conta_id, a.contaId)
    assert.equal(log.grupo_id, a.grupoId)
    assert.deepEqual(log.detalhe, { motoId, chassi: 'PM514CHASSIA1', de: '6400.00', para: '2016.38' })
  })
})

test('sócio da Conta B não corrige moto da Conta A: mesma frase de moto inexistente, nada muda nem loga', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    const motoId = await a.moto('PM514CHASSIA2')
    const daA = await preco.corrigirPrecoCompra(b.socio, motoId, '1.00', tx)
    const inexistente = await preco.corrigirPrecoCompra(b.socio, crypto.randomUUID(), '1.00', tx)
    assert.deepEqual(daA, { ok: false, erro: 'Moto não encontrada' })
    assert.deepEqual(inexistente, daA)
    assert.equal(await precoDa(tx, motoId), '6400.00')
    assert.equal((await logs(tx, motoId)).length, 0)
  })
})

test('aux_adm é recusado e o preço não muda', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const motoId = await a.moto('PM514CHASSIA3')
    assert.deepEqual(await preco.corrigirPrecoCompra(a.aux, motoId, '1.00', tx), { ok: false, erro: 'Sem permissão' })
    assert.equal(await precoDa(tx, motoId), '6400.00')
  })
})

test('moto vendida não tem o preço corrigido', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const motoId = await a.moto('PM514CHASSIA4', 'vendida')
    assert.deepEqual(await preco.corrigirPrecoCompra(a.socio, motoId, '1.00', tx),
      { ok: false, erro: 'Moto vendida: o preço de compra não pode mais ser corrigido' })
    assert.equal(await precoDa(tx, motoId), '6400.00')
    assert.equal((await logs(tx, motoId)).length, 0)
  })
})

test('preço inválido é recusado; mesmo valor não muda nada nem loga', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const motoId = await a.moto('PM514CHASSIA5')
    for (const ruim of ['', '0', '-3', 'abc']) {
      assert.deepEqual(await preco.corrigirPrecoCompra(a.socio, motoId, ruim, tx), { ok: false, erro: 'Preço de compra inválido' }, ruim)
    }
    assert.deepEqual(await preco.corrigirPrecoCompra(a.socio, motoId, '6400', tx), { ok: true })
    assert.equal((await logs(tx, motoId)).length, 0)
  })
})
