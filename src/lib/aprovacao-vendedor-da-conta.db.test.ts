// Teste de banco: Postgres descartável, como src/lib/pedido-moto-do-usuario.db.test.ts
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
let aprovacaoDoUsuario: typeof import('@/lib/aprovacao-do-usuario')['aprovacaoDoUsuario']
let vendedorDaConta: typeof import('@/lib/vendedor-da-conta')['vendedorDaConta']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ aprovacaoDoUsuario } = await import('@/lib/aprovacao-do-usuario'))
  ;({ vendedorDaConta } = await import('@/lib/vendedor-da-conta'))
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
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'AV404 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'AV404 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja AV404 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [vendedor] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Vendedor', ${'vend-av404' + nome + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
  const [socio] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, grupos_acesso)
    values (gen_random_uuid(), 'Socio', ${'socio-av404' + nome + '@teste.invalid'}, 'admin_socio', null, array[${grupo.id}]::uuid[]) returning id`)
  const [socioSoConta] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id, conta_id)
    values (gen_random_uuid(), 'Socio conta', ${'socioc-av404' + nome + '@teste.invalid'}, 'admin_socio', null, ${conta.id}) returning id`)
  const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', ${'AV404 ' + nome}, 'autopropelido', '1000', 'hub', '32') returning id`)
  const [moto] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
    values (${'AV404-' + nome}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'montada', 'aguardando_aprovacao') returning id`)
  const [aprovacao] = await linhas(tx, sql`insert into aprovacoes_venda (moto_id, loja_id, vendedor_id, valor, dados_venda, motivo)
    values (${moto.id}, ${loja.id}, ${vendedor.id}, 1000, '{}'::jsonb, 'abaixo do mínimo') returning id`)
  return {
    lojaId: loja.id as string,
    aprovacaoId: aprovacao.id as string,
    vendedorId: vendedor.id as string,
    socioId: socio.id as string,
    socioSoContaId: socioSoConta.id as string,
    aux: { papel: 'aux_adm', contaId: conta.id as string },
    socio: { papel: 'admin_socio', contaId: conta.id as string },
  }
}

test('a própria Conta (aux e sócio) acha o pedido de aprovação', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040431')
    for (const usuario of [a.aux, a.socio]) {
      assert.equal((await aprovacaoDoUsuario(usuario, a.aprovacaoId, tx))?.id, a.aprovacaoId)
    }
  })
})

test('Conta B (aux e sócio) não acha o pedido de aprovação da Conta A, igual a um id inexistente (#404)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040432')
    const b = await semearConta(tx, 'B', '00000000040433')
    for (const usuario of [b.aux, b.socio]) {
      assert.equal(await aprovacaoDoUsuario(usuario, a.aprovacaoId, tx), null)
      assert.equal(await aprovacaoDoUsuario(usuario, crypto.randomUUID(), tx), null)
    }
  })
})

test('vendedor escolhido: vale o da loja, o sócio com acesso e o sócio só com conta_id da Conta da moto; o da Conta B não (#404)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000040434')
    const b = await semearConta(tx, 'B', '00000000040435')
    assert.equal(await vendedorDaConta(a.vendedorId, a.lojaId, tx), true)
    assert.equal(await vendedorDaConta(a.socioId, a.lojaId, tx), true)
    assert.equal(await vendedorDaConta(a.socioSoContaId, a.lojaId, tx), true)
    assert.equal(await vendedorDaConta(b.vendedorId, a.lojaId, tx), false)
    assert.equal(await vendedorDaConta(b.socioId, a.lojaId, tx), false)
    assert.equal(await vendedorDaConta(b.socioSoContaId, a.lojaId, tx), false)
    assert.equal(await vendedorDaConta(crypto.randomUUID(), a.lojaId, tx), false)
  })
})
