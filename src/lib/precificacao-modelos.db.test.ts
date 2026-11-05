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
let salvarPrecoDoModelo: Prec['salvarPrecoDoModelo']
let salvarPadraoSimulador: Prec['salvarPadraoSimulador']
let ocultarModelo: typeof import('@/lib/modelos-da-conta')['ocultarModelo']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ catalogoDePrecificacao, modeloPrecificavel, salvarPrecoDoModelo, salvarPadraoSimulador } = await import('@/lib/precificacao-modelos'))
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

type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]

async function duasContas(tx: Tx) {
  const linha = async (q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: { id: string }[] }).rows[0].id
  const contaA = await linha(sql`insert into contas (nome) values ('Prec 12x A') returning id`)
  const contaB = await linha(sql`insert into contas (nome) values ('Prec 12x B') returning id`)
  const grupoA = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Prec 12x A', '00000000001201', ${contaA}) returning id`)
  const grupoB = await linha(sql`insert into grupos (nome, cnpj, conta_id) values ('Prec 12x B', '00000000001202', ${contaB}) returning id`)
  await tx.execute(sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('TESTE-12X', 'M12X', 'autopropelido', '1000', '', '')`)
  return { a: { id: grupoA, contaId: contaA }, b: { id: grupoB, contaId: contaB } }
}

async function precoDoGrupo(tx: Tx, grupoId: string) {
  const r = (await tx.execute(sql`select id, valor_minimo, valor_12x from precificacao where grupo_id = ${grupoId} and nome = 'M12X'`)) as unknown as {
    rows: { id: string; valor_minimo: string; valor_12x: string | null }[]
  }
  return r.rows[0] ?? null
}

test('valor em 12x: grava, mantém quando não vem e limpa quando vem vazio', async () => {
  await assert.rejects(db.transaction(async tx => {
    const { a } = await duasContas(tx)
    await salvarPrecoDoModelo(a, { nome: 'm12x', valorMinimo: '12990', valor12x: '15600' }, tx)
    const criado = (await precoDoGrupo(tx, a.id))!
    assert.deepEqual([criado.valor_minimo, criado.valor_12x], ['12990.00', '15600.00'])

    await salvarPrecoDoModelo(a, { precId: criado.id, nome: 'M12X', valorMinimo: '12500', valor12x: '15600.00' }, tx)
    const editado = (await precoDoGrupo(tx, a.id))!
    assert.deepEqual([editado.valor_minimo, editado.valor_12x], ['12500.00', '15600.00'])

    // Sem o campo (outra tela que grava preço): o 12x fica como estava.
    await salvarPrecoDoModelo(a, { precId: criado.id, nome: 'M12X', valorMinimo: '12400' }, tx)
    assert.equal((await precoDoGrupo(tx, a.id))!.valor_12x, '15600.00')

    await salvarPrecoDoModelo(a, { precId: criado.id, nome: 'M12X', valorMinimo: '12500', valor12x: '' }, tx)
    assert.equal((await precoDoGrupo(tx, a.id))!.valor_12x, null)

    await assert.rejects(salvarPrecoDoModelo(a, { precId: criado.id, nome: 'M12X', valorMinimo: '12500', valor12x: '-1' }, tx), /Valor em 12x inválido/)
    throw new Desfazer()
  }), Desfazer)
})

test('valor em 12x: o grupo da Conta B não muda o preço da Conta A pelo id', async () => {
  await assert.rejects(db.transaction(async tx => {
    const { a, b } = await duasContas(tx)
    await salvarPrecoDoModelo(a, { nome: 'M12X', valorMinimo: '12990', valor12x: '15600' }, tx)
    const daA = (await precoDoGrupo(tx, a.id))!

    // O id de A procurado no grupo de B não acha linha: nada muda, em nenhum dos dois.
    await salvarPrecoDoModelo(b, { precId: daA.id, nome: 'M12X', valorMinimo: '1', valor12x: '2' }, tx)
    assert.deepEqual(await precoDoGrupo(tx, a.id), daA, 'o preço da A ficou igual')
    assert.equal(await precoDoGrupo(tx, b.id), null)

    // O de B nasce pelo caminho de modelo novo, sem tocar no da A.
    await salvarPrecoDoModelo(b, { nome: 'M12X', valorMinimo: '1', valor12x: '2' }, tx)
    const deB = (await precoDoGrupo(tx, b.id))!
    assert.deepEqual([deB.valor_minimo, deB.valor_12x], ['1.00', '2.00'])
    assert.deepEqual(await precoDoGrupo(tx, a.id), daA)
    throw new Desfazer()
  }), Desfazer)
})

test('padrão do simulador é por grupo e não mexe nas taxas', async () => {
  await assert.rejects(db.transaction(async tx => {
    const { a, b } = await duasContas(tx)
    await tx.execute(sql`insert into configuracao_taxas (grupo_id, taxas_cartao) values (${a.id}, '{"12": 0.1}')`)
    const padrao = async (g: string) => ((await tx.execute(sql`select padrao_simulador, taxas_cartao from configuracao_taxas where grupo_id = ${g}`)) as unknown as {
      rows: { padrao_simulador: string; taxas_cartao: Record<string, number> }[]
    }).rows[0] ?? null
    assert.equal((await padrao(a.id))!.padrao_simulador, 'taxas', 'quem já existe fica no padrão de hoje')

    await salvarPadraoSimulador(a.id, 'avista_12x', tx)
    assert.deepEqual(await padrao(a.id), { padrao_simulador: 'avista_12x', taxas_cartao: { 12: 0.1 } })
    assert.equal(await padrao(b.id), null, 'o grupo B não ganhou configuração')

    await salvarPadraoSimulador(b.id, 'avista_12x', tx)
    await salvarPadraoSimulador(a.id, 'taxas', tx)
    assert.equal((await padrao(b.id))!.padrao_simulador, 'avista_12x')
    assert.equal((await padrao(a.id))!.padrao_simulador, 'taxas')
    throw new Desfazer()
  }), Desfazer)
})
