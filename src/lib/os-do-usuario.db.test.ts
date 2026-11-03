// Teste de banco: Postgres descartável, como src/lib/excluir-venda-peca.db.test.ts
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
let osDoUsuario: typeof import('@/lib/os-do-usuario')['osDoUsuario']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ osDoUsuario } = await import('@/lib/os-do-usuario'))
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
  const base = await semearContaBase(tx, { prefixo: 'OS404', nome, cnpj })
  const auxId = await semearUsuario(tx, base, { papel: 'aux_adm', rotulo: 'aux' })
  const [os] = await linhas(tx, sql`insert into ordens_servico (loja_id, aberta_por, descricao) values (${base.lojaId}, ${auxId}, 'OS 404') returning id`)
  return {
    osId: os.id as string,
    aux: { papel: 'aux_adm', lojaId: base.lojaId, gruposAcesso: null, contaId: base.contaId },
    socio: { papel: 'admin_socio', lojaId: null, gruposAcesso: [base.grupoId], contaId: base.contaId },
  }
}

test('a própria Conta (aux e sócio) acha a OS', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040411')
    for (const usuario of [a.aux, a.socio]) {
      assert.equal((await osDoUsuario(usuario, a.osId, tx))?.status, 'aberta')
    }
  })
})

test('Conta B (aux e sócio) não acha a OS da Conta A, igual a um id inexistente (#404)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040412')
    const b = await semearConta(tx, 'B', '00000000040413')
    for (const usuario of [b.aux, b.socio]) {
      assert.equal(await osDoUsuario(usuario, a.osId, tx), null)
      assert.equal(await osDoUsuario(usuario, crypto.randomUUID(), tx), null)
    }
  })
})
