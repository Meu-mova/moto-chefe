// Teste de banco: roda contra o Postgres descartável do CI (job `banco` do ci.yml).
// Como montar local: ver o cabeçalho de src/lib/efetivar-pedido.db.test.ts.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

let db: typeof import('@/lib/db')['db']
let gruposParaOSeletor: typeof import('@/lib/dados-seletor')['gruposParaOSeletor']
let gruposVisiveis: typeof import('@/lib/acesso-grupo')['gruposVisiveis']

before(async () => {
  ;({ db } = await import('@/lib/db'))
  ;({ gruposParaOSeletor } = await import('@/lib/dados-seletor'))
  ;({ gruposVisiveis } = await import('@/lib/acesso-grupo'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
const linha = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: Record<string, string>[] }).rows[0]

test('seletor do sócio da Conta A: só os grupos dele chegam ao navegador, nada da Conta B', async () => {
  await assert.rejects(db.transaction(async tx => {
    const conta = (nome: string) => linha(tx, sql`insert into contas (nome) values (${nome}) returning id`)
    const [a, b] = [await conta('Conta A'), await conta('Conta B')]
    const grupo = async (contaId: string, nome: string, cnpj: string, cidade: string) => {
      const g = await linha(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${nome}, ${cnpj}, ${contaId}) returning id, nome, cnpj, conta_id, cor, cidade_sede`)
      await tx.execute(sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja ' + nome}, ${cidade}, 'R', ${g.id})`)
      return { id: g.id, nome: g.nome, cnpj: g.cnpj, contaId: g.conta_id, cor: g.cor ?? null, cidadeSede: g.cidade_sede ?? null }
    }
    const a1 = await grupo(a.id, 'A1', '00000000000191', 'Cidade A1')
    const a2 = await grupo(a.id, 'A2', '00000000000272', 'Cidade A2')
    const b1 = await grupo(b.id, 'B1', '00000000000353', 'Cidade B1')

    // Mesmo caminho do GroupSelector: o que o sócio vê, e só isso vira dado do seletor.
    const socioA = { papel: 'admin_socio', contaId: a.id, gruposAcesso: [a2.id] }
    const ids = gruposVisiveis(socioA, a1.id, [a1, a2, b1])
    const dados = await gruposParaOSeletor([a1, a2, b1].filter(g => ids.includes(g.id)), new Map([[a.id, 'Conta A'], [b.id, 'Conta B']]), tx)
    assert.deepEqual(dados.map(d => d.id).sort(), [a1.id, a2.id].sort())
    assert.deepEqual(dados.map(d => d.cidade).sort(), ['Cidade A1', 'Cidade A2'])
    assert.ok(!JSON.stringify(dados).includes('B1') && !JSON.stringify(dados).includes('Conta B'), 'nada da Conta B no que vai ao navegador')
    throw new Desfazer()
  }), Desfazer)
})
