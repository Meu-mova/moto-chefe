// Teste de banco: Postgres descartável, como src/lib/pecas-da-conta.db.test.ts.
// Entrada de peças pela NF-e (#426): grava na Conta da loja de destino e nunca lê,
// sobrescreve ou se liga a peça, vínculo ou loja de outra Conta.
// O vínculo e a nota são conferidos por SQL porque as leituras deles chegam na #427.
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
let entrada: typeof import('@/lib/entrada-pecas')
let catalogo: typeof import('@/lib/pecas-da-conta')
let saldos: typeof import('@/lib/estoque-pecas-loja')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  entrada = await import('@/lib/entrada-pecas')
  catalogo = await import('@/lib/pecas-da-conta')
  saldos = await import('@/lib/estoque-pecas-loja')
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
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'EP426 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'EP426 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja EP426 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const [aux] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'Aux', ${'aux-ep426' + nome + '@teste.invalid'}, 'aux_adm', ${loja.id}) returning id`)
  const peca = await catalogo.inserirPeca(tx, conta.id, { nome: 'Capacete ' + nome, valor: 90 })
  return { contaId: conta.id as string, grupoId: grupo.id as string, lojaId: loja.id as string, auxId: aux.id as string, pecaId: peca.id }
}

const NOTA = { chaveAcesso: '5'.repeat(44), numero: '43837', fornecedorCnpj: '12345678000199' }
const CAPACETE = { codigo: '26302', nomeXml: 'CAPACETE ABS + EPS, AZUL', quantidade: 4, custoUnitario: 32.61 }

test('peça nova entra no catálogo da Conta da loja, com saldo, custo, vínculo e nota', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await entrada.gravarEntradaPecas(tx, {
      lojaId: a.lojaId, usuarioId: a.auxId, nota: NOTA,
      linhas: [{ ...CAPACETE, nova: { nome: 'Capacete ciclista azul', valor: 79.9 } }],
    })

    const [nova] = (await catalogo.listarPecas(tx, { papel: 'aux_adm', contaId: a.contaId }, { lojaId: a.lojaId }))
      .filter(p => p.nome === 'Capacete ciclista azul')
    assert.ok(nova, 'peça nova no catálogo da Conta A')
    assert.equal(Number(nova.valor), 79.9)
    assert.equal(Number(nova.quantidadeEstoque), 4)

    const [peca] = await linhas(tx, sql`select custo from pecas_catalogo where id = ${nova.id}`)
    assert.equal(Number(peca.custo), 32.61)
    const vinculos = await linhas(tx, sql`select conta_id, peca_id from pecas_vinculo_fornecedor where nome_xml = ${CAPACETE.nomeXml}`)
    assert.deepEqual(vinculos, [{ conta_id: a.contaId, peca_id: nova.id }])
    const notas = await linhas(tx, sql`select conta_id, grupo_id, loja_id from notas_entrada where chave_acesso = ${NOTA.chaveAcesso}`)
    assert.deepEqual(notas, [{ conta_id: a.contaId, grupo_id: a.grupoId, loja_id: a.lojaId }])
  })
})

// Roda num savepoint: a recusa desfaz só ela, e dá para conferir que nada ficou.
const recusa = (tx: Tx, e: Parameters<typeof entrada.gravarEntradaPecas>[1]) =>
  assert.rejects(tx.transaction(t => entrada.gravarEntradaPecas(t, e)), (erro: unknown) => erro instanceof entrada.EntradaPecasRecusada)

test('peça da Conta B na entrada da loja da Conta A é recusada e nada é gravado', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    await recusa(tx, {
      lojaId: a.lojaId, usuarioId: a.auxId, nota: NOTA,
      linhas: [{ ...CAPACETE, pecaId: b.pecaId }],
    })

    const [pecaB] = await linhas(tx, sql`select custo from pecas_catalogo where id = ${b.pecaId}`)
    assert.equal(pecaB.custo, null)
    assert.equal(await saldos.saldoNaLoja(tx, b.pecaId, b.lojaId), 0)
    assert.deepEqual(await linhas(tx, sql`select 1 from pecas_vinculo_fornecedor where peca_id = ${b.pecaId}`), [])
    assert.deepEqual(await linhas(tx, sql`select 1 from notas_entrada where chave_acesso = ${NOTA.chaveAcesso}`), [])
  })
})

test('quantidade com decimal, zero ou negativa é recusada: estoque de peça é inteiro', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    for (const quantidade of [1.5, 0, -2]) {
      await recusa(tx, { lojaId: a.lojaId, usuarioId: a.auxId, nota: NOTA, linhas: [{ ...CAPACETE, quantidade, pecaId: a.pecaId }] })
    }
    assert.equal(await saldos.saldoNaLoja(tx, a.pecaId, a.lojaId), 0)
  })
})

test('peça nova sem preço de venda maior que zero é recusada', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await recusa(tx, { lojaId: a.lojaId, usuarioId: a.auxId, nota: NOTA, linhas: [{ ...CAPACETE, nova: { nome: 'Sem preço', valor: 0 } }] })
    assert.deepEqual(await linhas(tx, sql`select 1 from pecas_catalogo where nome = 'Sem preço'`), [])
  })
})

test('loja inexistente é recusada, sem gravar nada', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await recusa(tx, { lojaId: '00000000-0000-0000-0000-000000000000', usuarioId: a.auxId, nota: NOTA, linhas: [{ ...CAPACETE, pecaId: a.pecaId }] })
    assert.deepEqual(await linhas(tx, sql`select 1 from notas_entrada where chave_acesso = ${NOTA.chaveAcesso}`), [])
  })
})

test('a Conta B lança o mesmo item do mesmo fornecedor e o vínculo da Conta A não muda', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    await entrada.gravarEntradaPecas(tx, { lojaId: a.lojaId, usuarioId: a.auxId, nota: NOTA, linhas: [{ ...CAPACETE, pecaId: a.pecaId }] })
    await entrada.gravarEntradaPecas(tx, { lojaId: b.lojaId, usuarioId: b.auxId, nota: NOTA, linhas: [{ ...CAPACETE, pecaId: b.pecaId }] })

    const vinculos = await linhas(tx, sql`select conta_id, peca_id from pecas_vinculo_fornecedor
      where nome_xml = ${CAPACETE.nomeXml} order by conta_id = ${a.contaId} desc`)
    assert.deepEqual(vinculos, [{ conta_id: a.contaId, peca_id: a.pecaId }, { conta_id: b.contaId, peca_id: b.pecaId }])
    assert.equal(await saldos.saldoNaLoja(tx, a.pecaId, a.lojaId), 4)
    assert.equal(await saldos.saldoNaLoja(tx, b.pecaId, b.lojaId), 4)
  })
})

test('o banco recusa vínculo da Conta A apontando para peça da Conta B, mesmo por fora do código', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const b = await semearConta(tx, 'B', '22222222000191')
    await assert.rejects(
      tx.transaction(t => t.execute(sql`insert into pecas_vinculo_fornecedor (conta_id, fornecedor_cnpj, codigo, nome_xml, peca_id)
        values (${a.contaId}, '1', '1', 'X', ${b.pecaId})`)),
      (erro: { cause?: { constraint?: string } }) => erro.cause?.constraint === 'pecas_vinculo_fornecedor_peca_da_conta_fkey',
    )
  })
})

test('peça existente: soma ao saldo da loja, o custo passa a ser o da última nota e o preço não muda', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    await saldos.definirSaldo(tx, a.pecaId, a.lojaId, 3)
    await entrada.gravarEntradaPecas(tx, { lojaId: a.lojaId, usuarioId: a.auxId, nota: NOTA, linhas: [{ ...CAPACETE, pecaId: a.pecaId, custoUnitario: 30 }] })
    await entrada.gravarEntradaPecas(tx, { lojaId: a.lojaId, usuarioId: a.auxId, nota: NOTA, linhas: [{ ...CAPACETE, pecaId: a.pecaId, custoUnitario: 35.5 }] })

    assert.equal(await saldos.saldoNaLoja(tx, a.pecaId, a.lojaId), 11)
    const [peca] = await linhas(tx, sql`select custo, valor from pecas_catalogo where id = ${a.pecaId}`)
    assert.deepEqual([Number(peca.custo), Number(peca.valor)], [35.5, 90])
  })
})

test('mesmo item ligado a outra peça da Conta: o vínculo passa a apontar para ela', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '11111111000191')
    const outra = await catalogo.inserirPeca(tx, a.contaId, { nome: 'Capacete azul (novo cadastro)', valor: 95 })
    await entrada.gravarEntradaPecas(tx, { lojaId: a.lojaId, usuarioId: a.auxId, nota: NOTA, linhas: [{ ...CAPACETE, pecaId: a.pecaId }] })
    await entrada.gravarEntradaPecas(tx, { lojaId: a.lojaId, usuarioId: a.auxId, nota: NOTA, linhas: [{ ...CAPACETE, pecaId: outra.id }] })
    const vinculos = await linhas(tx, sql`select peca_id from pecas_vinculo_fornecedor where conta_id = ${a.contaId}`)
    assert.deepEqual(vinculos, [{ peca_id: outra.id }])
  })
})
