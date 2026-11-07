// Teste de banco: Postgres descartável, como src/lib/os-do-usuario.db.test.ts
// (roteiro para rodar local no topo de src/lib/efetivar-pedido.db.test.ts).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let pedidoDoUsuario: typeof import('@/lib/pedido-do-usuario')['pedidoDoUsuario']
let itensDoPedido: typeof import('@/lib/pedido-do-usuario')['itensDoPedido']
let motoDoUsuario: typeof import('@/lib/moto-do-usuario')['motoDoUsuario']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ pedidoDoUsuario, itensDoPedido } = await import('@/lib/pedido-do-usuario'))
  ;({ motoDoUsuario } = await import('@/lib/moto-do-usuario'))
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
  const base = await semearContaBase(tx, { prefixo: 'PV404', nome, cnpj })
  const auxId = await semearUsuario(tx, base, { papel: 'aux_adm', rotulo: 'aux' })
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${'PV404 ' + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${'PV404-' + nome}, ${modelo.id}, ${base.lojaId}, 'CINZA', '1', 'montada', 'disponivel') returning id`)
  const [pedido] = await linhas(tx, sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${base.lojaId}, ${auxId}) returning id`)
  await linhas(tx, sql`insert into pedidos_venda_itens (pedido_venda_id, tipo, moto_id, valor_unitario) values (${pedido.id}, 'moto', ${moto.id}, 15000) returning id`)
  return {
    motoId: moto.id as string,
    pedidoId: pedido.id as string,
    aux: { papel: 'aux_adm', lojaId: base.lojaId, gruposAcesso: null, contaId: base.contaId },
    socio: { papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId },
  }
}

test('a própria Conta (aux e sócio) acha o pedido e a moto', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040421')
    for (const usuario of [a.aux, a.socio]) {
      assert.equal((await pedidoDoUsuario(usuario, a.pedidoId, tx))?.status, 'pendente')
      assert.equal((await motoDoUsuario(usuario, a.motoId, tx))?.id, a.motoId)
    }
  })
})

test('Conta B (aux e sócio) não acha pedido nem moto da Conta A, igual a um id inexistente (#404)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040422')
    const b = await semearConta(tx, 'B', '00000000040423')
    for (const usuario of [b.aux, b.socio]) {
      assert.equal(await pedidoDoUsuario(usuario, a.pedidoId, tx), null)
      assert.equal(await pedidoDoUsuario(usuario, crypto.randomUUID(), tx), null)
      assert.equal(await motoDoUsuario(usuario, a.motoId, tx), null)
      assert.equal(await motoDoUsuario(usuario, crypto.randomUUID(), tx), null)
    }
  })
})

test('itens do pedido (#774): a própria Conta e o admin_geral leem; Conta B recebe null, igual a um id inexistente', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040424')
    const b = await semearConta(tx, 'B', '00000000040425')
    const daMotoA = [{ tipo: 'moto', motoId: a.motoId, pecaId: null, quantidade: '1.00', valorUnitario: '15000.00' }]
    const adminGeral = { papel: 'admin_geral', lojaId: null, gruposAcesso: null, contaId: null }
    for (const usuario of [a.aux, a.socio, adminGeral]) assert.deepEqual(await itensDoPedido(usuario, a.pedidoId, tx), daMotoA)
    for (const usuario of [b.aux, b.socio]) {
      assert.equal(await itensDoPedido(usuario, a.pedidoId, tx), null)
      assert.equal(await itensDoPedido(usuario, crypto.randomUUID(), tx), null)
    }
  })
})
