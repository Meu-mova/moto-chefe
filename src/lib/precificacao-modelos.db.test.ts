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
type Prec = typeof import('@/lib/precificacao-modelos')
let db: Db['db']
let catalogoDePrecificacao: Prec['catalogoDePrecificacao']
let modeloPrecificavel: Prec['modeloPrecificavel']
let ocultarModelo: typeof import('@/lib/modelos-da-conta')['ocultarModelo']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ catalogoDePrecificacao, modeloPrecificavel } = await import('@/lib/precificacao-modelos'))
  ;({ ocultarModelo } = await import('@/lib/modelos-da-conta'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('precificação: a Conta B não vê nem precifica o modelo próprio da A, e o estoque é por modelo e loja', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = await linha(sql`insert into contas (nome) values ('Prec 496 A') returning id`)
    const contaB = await linha(sql`insert into contas (nome) values ('Prec 496 B') returning id`)
    const grupoA = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Prec 496 A', '00000000049601', ${contaA.id}) returning id`)
    const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Prec 496 B', '00000000049602', ${contaB.id}) returning id`)
    const lojaA = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja 496 A', 'C', 'R', ${grupoA.id}) returning id`)
    const lojaB = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values ('Loja 496 B', 'C', 'R', ${grupoB.id}) returning id`)
    const plataforma = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-496', 'P496', 'autopropelido', '1000', '', '') returning id`)
    const oculto = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-496', 'OCULTO496', 'autopropelido', '1000', '', '') returning id`)
    // Mesmo nome do da plataforma com outra grafia: era o que casava o estoque errado.
    const daA = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max, conta_id) values ('TESTE-496', 'p496 a', 'autopropelido', '1000', '', '', ${contaA.id}) returning id`)
    await ocultarModelo(contaB.id, oculto.id, true, tx)
    for (const [loja, modelo, n] of [[lojaA, plataforma, 2], [lojaB, plataforma, 1], [lojaA, daA, 1]] as const) {
      for (let i = 0; i < n; i++) {
        await tx.execute(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
          values (${`PREC496${loja.id.slice(0, 4)}${modelo.id.slice(0, 4)}${i}`}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'disponivel', 'disponivel')`)
      }
    }

    const doTeste = <T extends { marca: string }>(l: T[]) => l.filter(m => m.marca === 'TESTE-496')
    const deB = doTeste(await catalogoDePrecificacao(contaB.id, [lojaB.id], tx))
    assert.deepEqual(deB.map(m => [m.modelo, m.estoqueDisponivel]), [['P496', 1]], 'B: sem o modelo da A nem o oculto; só o estoque de B')

    const deA = doTeste(await catalogoDePrecificacao(contaA.id, [lojaA.id], tx))
    assert.deepEqual(
      deA.map(m => [m.modelo, m.estoqueDisponivel]).sort(),
      [['OCULTO496', 0], ['P496', 2], ['p496 a', 1]],
      'A: plataforma + o dela, cada um com o próprio estoque',
    )

    assert.equal(await modeloPrecificavel(contaB.id, 'P496 A', tx), false, 'B não precifica o modelo da A')
    assert.equal(await modeloPrecificavel(contaB.id, 'OCULTO496', tx), false, 'nem o que ocultou')
    assert.equal(await modeloPrecificavel(contaB.id, 'NAOEXISTE496', tx), false)
    assert.equal(await modeloPrecificavel(contaB.id, ' p496 ', tx), true)
    assert.equal(await modeloPrecificavel(contaA.id, 'P496 A', tx), true)
    throw new Desfazer()
  }), Desfazer)
})
