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
type Mod = typeof import('@/lib/busca-chassi')
let db: Db['db']
let buscarMotosPorChassi: Mod['buscarMotosPorChassi']
let buscarHistoricoPorChassi: Mod['buscarHistoricoPorChassi']
let gravarVeiculosHistorico: Mod['gravarVeiculosHistorico']
let chassisNasMotos: Mod['chassisNasMotos']
let motoDaContaPorChassi: Mod['motoDaContaPorChassi']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ buscarMotosPorChassi, buscarHistoricoPorChassi, gravarVeiculosHistorico, chassisNasMotos, motoDaContaPorChassi } = await import('@/lib/busca-chassi'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

test('busca por chassi da Conta B não acha moto da Conta A (#325)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const modelo = await linha(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'C325', 'autopropelido', '1000', 'hub', '32') returning id`)
    const contas: string[] = []
    for (const [nome, cnpj, chassi] of [['A', '00000000032501', 'BUSCA325A'], ['B', '00000000032502', 'BUSCA325B']]) {
      const conta = await linha(sql`insert into contas (nome) values (${'Busca 325 ' + nome}) returning id`)
      contas.push(conta.id)
      const grupo = await linha(sql`insert into grupos (nome, cnpj, conta_id) values (${'Busca 325 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
      const loja = await linha(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja 325 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
      await tx.execute(sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada, status, disponibilidade)
        values (${chassi}, ${modelo.id}, ${loja.id}, 'CINZA', '1', 'vendida', 'vendida')`)
    }

    // Conferência da importação: chassi de moto de outra Conta não aparece como "já no sistema".
    assert.deepEqual(await chassisNasMotos(['BUSCA325A', 'BUSCA325B'], contas[1], null, tx), ['BUSCA325B'])
    assert.deepEqual((await chassisNasMotos(['BUSCA325A', 'BUSCA325B'], null, null, tx)).sort(), ['BUSCA325A', 'BUSCA325B'])

    // Chassi exato (cupom, importação de garantias): só moto da própria Conta.
    assert.equal(await motoDaContaPorChassi('BUSCA325A', contas[1], null, tx), null, 'moto da A não serve para a B')
    assert.equal((await motoDaContaPorChassi('BUSCA325B', contas[1], null, tx))?.chassi, 'BUSCA325B')

    const daB = await buscarMotosPorChassi('BUSCA325', { contaDasMotos: contas[1], contaDoComprador: contas[1], limite: 10 }, tx)
    assert.deepEqual(daB.map(m => m.chassi), ['BUSCA325B'])

    const geral = (await buscarMotosPorChassi('BUSCA325', { contaDasMotos: null, contaDoComprador: contas[1], limite: 10 }, tx)).map(m => m.chassi).sort()
    assert.deepEqual(geral, ['BUSCA325A', 'BUSCA325B'], 'admin_geral acha as duas')
    throw new Desfazer()
  }), Desfazer)
})

test('histórico de veículos: Conta B não acha nem sobrescreve veículo da Conta A (#325)', async () => {
  await assert.rejects(db.transaction(async tx => {
    const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0]
    const contaA = (await linha(sql`insert into contas (nome) values ('Hist 325 A') returning id`)).id
    const contaB = (await linha(sql`insert into contas (nome) values ('Hist 325 B') returning id`)).id
    const veiculo = (chassi: string, cor: string) => ({ chassi, numeroMotor: null, marca: 'M', modelo: 'H', cor, ano: null, nfEntrada: null })

    await gravarVeiculosHistorico([veiculo('HIST325A', 'AZUL')], contaA, tx)
    // A B tem o próprio veículo com o mesmo chassi: entra para ela, sem tocar no da A.
    const gravadosB = await gravarVeiculosHistorico([veiculo('HIST325B', 'VERDE'), veiculo('HIST325A', 'ROSA')], contaB, tx)
    assert.equal(gravadosB, 2)

    assert.deepEqual((await buscarHistoricoPorChassi('HIST325', contaB, 10, tx)).map(v => [v.chassi, v.cor]).sort(),
      [['HIST325A', 'ROSA'], ['HIST325B', 'VERDE']], 'B vê só as próprias linhas')
    assert.deepEqual((await buscarHistoricoPorChassi('HIST325', contaA, 10, tx)).map(v => [v.chassi, v.cor]),
      [['HIST325A', 'AZUL']], 'a linha da A continua intacta')

    // Reimportar na própria Conta atualiza.
    await gravarVeiculosHistorico([veiculo('HIST325A', 'PRETO')], contaA, tx)
    assert.equal((await buscarHistoricoPorChassi('HIST325A', contaA, 10, tx))[0].cor, 'PRETO')
    assert.equal((await buscarHistoricoPorChassi('HIST325A', contaB, 10, tx))[0].cor, 'ROSA', 'e não mexe na B')
    assert.equal((await buscarHistoricoPorChassi('HIST325', null, 10, tx)).length, 3, 'admin_geral acha todas')
    throw new Desfazer()
  }), Desfazer)
})
