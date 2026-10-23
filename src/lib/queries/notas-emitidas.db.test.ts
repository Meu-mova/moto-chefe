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
let db: Db['db']
let listarNotasEmitidas: typeof import('@/lib/queries/notas-emitidas')['listarNotasEmitidas']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ listarNotasEmitidas } = await import('@/lib/queries/notas-emitidas'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('Notas Emitidas: a Conta B não vê nota da Conta A, e cada lista fica no grupo e no ambiente (#348)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'N348', 'autopropelido', '1000', 'hub', '32') returning id`)
    const ids: Record<string, { conta: string; grupo: string; venda: number }> = {}
    for (const [nome, cnpj] of [['A', '00000000034801'], ['B', '00000000034802']] as const) {
      const conta = await linha(sql`insert into contas (nome) values (${'Notas 348 ' + nome}) returning id`)
      const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Notas 348 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
      const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja 348 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
      const vendedor = await linha(sql`insert into usuarios (id, nome, email, papel, loja_id) values (gen_random_uuid(), ${'Vend 348 ' + nome}, ${'vend348' + nome + '@teste.invalid'}, 'vendedor', ${loja.id}) returning id`)
      const moto = await linha(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade) values (${'NOTAS348' + nome}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'vendida', 'vendida') returning id`)
      const pedido = await linha(sql`insert into pedidos_venda (moto_id, loja_id, vendedor_id) values (${moto.id}, ${loja.id}, ${vendedor.id}) returning id`)
      const venda = await linha(sql`insert into vendas (pedido_venda_id, moto_id, loja_id, vendedor_id, efetivado_por, cliente_nome, cliente_cpf, valor, forma_pagamento)
        values (${pedido.id}, ${moto.id}, ${loja.id}, ${vendedor.id}, ${vendedor.id}, ${'Cliente ' + nome}, '52998224725', 10000, 'pix') returning id, numero`) as unknown as { id: string; numero: number }
      for (const [status, ambiente, nf] of [['Autorizada', 'Producao', '1'], ['Negada', 'Producao', '2'], ['Autorizada', 'Homologacao', '3']]) {
        await tx.execute(sql`insert into notas_fiscais_saida (venda_id, grupo_id, id_externo, ambiente, status, numero, serie, payload)
          values (${venda.id}, ${grupo.id}, ${'ext348' + nome + nf}, ${ambiente}, ${status}, ${nome + nf}, '1', '{}'::jsonb)`)
      }
      ids[nome] = { conta: conta.id, grupo: grupo.id, venda: venda.numero }
    }

    const daB = await listarNotasEmitidas({ grupoId: ids.B.grupo, contaId: ids.B.conta, ambiente: 'Producao' }, tx)
    assert.deepEqual(daB.map(n => [n.numero, n.categoria, n.vendaNumero, n.clienteNome]).sort(),
      [['B1', 'autorizada', ids.B.venda, 'Cliente B'], ['B2', 'recusada', ids.B.venda, 'Cliente B']])

    // Grupo da A pedido com a Conta da B (cookie adulterado, por exemplo): nada volta.
    assert.deepEqual(await listarNotasEmitidas({ grupoId: ids.A.grupo, contaId: ids.B.conta, ambiente: 'Producao' }, tx), [])

    const homologacaoA = await listarNotasEmitidas({ grupoId: ids.A.grupo, contaId: ids.A.conta, ambiente: 'Homologacao' }, tx)
    assert.deepEqual(homologacaoA.map(n => n.numero), ['A3'])

    // admin_geral (sem Conta): continua preso ao grupo pedido.
    const geral = await listarNotasEmitidas({ grupoId: ids.A.grupo, contaId: null, ambiente: 'Producao' }, tx)
    assert.deepEqual(geral.map(n => n.numero).sort(), ['A1', 'A2'])
    throw new Desfazer()
  }), Desfazer)
})
