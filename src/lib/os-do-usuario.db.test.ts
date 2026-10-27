// Teste de banco: Postgres descartável, como src/lib/excluir-venda-peca.db.test.ts
// (roteiro para rodar local no topo de src/lib/efetivar-pedido.db.test.ts).
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
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'OS404 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'OS404 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja OS404 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Aux', ${'aux-os404' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}) returning id`)
  const [os] = await linhas(tx, sql`insert into ordens_servico (loja_id, aberta_por, descricao) values (${loja.id}, ${aux.id}, 'OS 404') returning id`)
  return {
    osId: os.id as string,
    aux: { papel: 'aux_adm', lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string },
    socio: { papel: 'admin_socio', lojaId: null, gruposAcesso: [grupo.id as string], contaId: conta.id as string },
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
