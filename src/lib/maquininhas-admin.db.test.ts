// Teste de banco: Postgres descartável, como src/lib/maquininhas.db.test.ts.
// Cadastro de maquininhas (#471): o sócio da Conta B não lista, não edita nem desativa as da Conta A.
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
let mod: typeof import('@/lib/maquininhas-admin')
let maquininhasDoGrupo: typeof import('@/lib/maquininhas')['maquininhasDoGrupo']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/maquininhas-admin')
  ;({ maquininhasDoGrupo } = await import('@/lib/maquininhas'))
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

async function semearGrupo(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'MQ471 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'MQ471 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  return grupo.id as string
}

test('grupo sem maquininha cadastra Rede e Outra; a venda passa a vê-las (#471)', async () => {
  await emTransacaoDesfeita(async tx => {
    const g = await semearGrupo(tx, 'Teresina', '71000000000101')
    await mod.criarMaquininha(tx, g, { escolha: 'rede', nome: 'Rede Itaú' })
    await mod.criarMaquininha(tx, g, { escolha: 'outra', nome: 'Sicredi' })
    assert.deepEqual(await maquininhasDoGrupo(tx, g), [
      { operadora: 'rede', nome: 'Rede Itaú' }, { operadora: 'sicredi', nome: 'Sicredi' },
    ])
    await assert.rejects(mod.criarMaquininha(tx, g, { escolha: 'rede', nome: 'Outra Rede' }),
      { message: 'Essa operadora já está cadastrada no grupo' })
    await assert.rejects(mod.criarMaquininha(tx, g, { escolha: 'outra', nome: '  ' }),
      { message: 'Informe o nome da maquininha' })
  })
})

test('desativar tira da venda e mantém na lista do cadastro; reativar volta (#471)', async () => {
  await emTransacaoDesfeita(async tx => {
    const g = await semearGrupo(tx, 'Desativa', '71000000000202')
    await mod.criarMaquininha(tx, g, { escolha: 'stone', nome: 'Stone' })
    const [m] = await mod.listarMaquininhasDoCadastro(tx, g)
    await mod.definirMaquininhaAtiva(tx, g, m.id, false)
    assert.deepEqual(await maquininhasDoGrupo(tx, g), [])
    assert.equal((await mod.listarMaquininhasDoCadastro(tx, g))[0].ativo, false)
    await mod.definirMaquininhaAtiva(tx, g, m.id, true)
    assert.equal((await maquininhasDoGrupo(tx, g)).length, 1)
  })
})

test('Conta B não lista, não edita nem desativa maquininha da Conta A; mesma frase de inexistente (#471)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearGrupo(tx, 'A', '71000000000303')
    const b = await semearGrupo(tx, 'B', '71000000000404')
    await mod.criarMaquininha(tx, a, { escolha: 'stone', nome: 'Stone A' })
    const [daA] = await mod.listarMaquininhasDoCadastro(tx, a)

    assert.deepEqual(await mod.listarMaquininhasDoCadastro(tx, b), [])
    const naoEncontrada = { message: 'Maquininha não encontrada' }
    await assert.rejects(mod.editarMaquininha(tx, b, daA.id, { escolha: 'rede', nome: 'Tomada' }), naoEncontrada)
    await assert.rejects(mod.definirMaquininhaAtiva(tx, b, daA.id, false), naoEncontrada)
    await assert.rejects(mod.editarMaquininha(tx, b, '00000000-0000-0000-0000-000000000000', { escolha: 'rede', nome: 'X' }), naoEncontrada)

    // B pode cadastrar a mesma operadora no próprio grupo; a da A segue intacta.
    await mod.criarMaquininha(tx, b, { escolha: 'stone', nome: 'Stone B' })
    assert.deepEqual(await maquininhasDoGrupo(tx, a), [{ operadora: 'stone', nome: 'Stone A' }])
  })
})

test('editar troca nome e operadora; não pode virar operadora já cadastrada no grupo (#471)', async () => {
  await emTransacaoDesfeita(async tx => {
    const g = await semearGrupo(tx, 'Edita', '71000000000505')
    await mod.criarMaquininha(tx, g, { escolha: 'stone', nome: 'Stone' })
    await mod.criarMaquininha(tx, g, { escolha: 'cielo', nome: 'Cielo' })
    const lista = await mod.listarMaquininhasDoCadastro(tx, g)
    const cielo = lista.find(m => m.operadora === 'cielo')!
    await assert.rejects(mod.editarMaquininha(tx, g, cielo.id, { escolha: 'stone', nome: 'Cielo' }),
      { message: 'Essa operadora já está cadastrada no grupo' })
    await mod.editarMaquininha(tx, g, cielo.id, { escolha: 'rede', nome: 'Rede da loja' })
    assert.deepEqual(await maquininhasDoGrupo(tx, g), [
      { operadora: 'rede', nome: 'Rede da loja' }, { operadora: 'stone', nome: 'Stone' },
    ])
  })
})
