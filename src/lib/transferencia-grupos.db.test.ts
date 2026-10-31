// Teste de banco: Postgres descartável, como src/lib/cliente-da-os.db.test.ts.
// Chave de transferência entre grupos por Conta e grupo de entrada da moto (#552).
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
let mod: typeof import('@/lib/transferencia-grupos')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  mod = await import('@/lib/transferencia-grupos')
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

async function semearConta(tx: Tx, nome: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'TG552 ' + nome}) returning id`)
  const grupo = async (sufixo: string) => {
    const [g] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'TG552 ' + nome + sufixo}, '00000000000000', ${conta.id}) returning id`)
    const [l] = await linhas(tx, sql`insert into lojas (nome, endereco, cidade, grupo_id) values (${'Loja ' + nome + sufixo}, 'Rua 1', 'X', ${g.id}) returning id`)
    return { grupoId: g.id as string, lojaId: l.id as string }
  }
  return { contaId: conta.id as string, g1: await grupo('1'), g2: await grupo('2') }
}

async function usuario(tx: Tx, papel: string, contaId: string | null, lojaId: string | null = null) {
  const [u] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
    values (gen_random_uuid(), 'TG552', ${'tg552-' + Math.random() + '@teste.local'}, ${papel}, ${lojaId}) returning id`)
  return { id: u.id as string, papel, contaId }
}

test('chave nasce desligada: comportamento de hoje', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    assert.equal(await mod.transferenciaEntreGruposLigada(a.contaId, tx), false)
  })
})

test('só o admin_geral liga a chave, e fica no log', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    for (const papel of ['admin_socio', 'aux_adm']) {
      const u = await usuario(tx, papel, a.contaId, a.g1.lojaId)
      assert.deepEqual(await mod.alterarTransferenciaEntreGrupos(u, a.contaId, true, tx), { ok: false, erro: 'Sem permissão' })
    }
    assert.equal(await mod.transferenciaEntreGruposLigada(a.contaId, tx), false)

    const geral = await usuario(tx, 'admin_geral', null)
    assert.deepEqual(await mod.alterarTransferenciaEntreGrupos(geral, a.contaId, true, tx), { ok: true })
    assert.equal(await mod.transferenciaEntreGruposLigada(a.contaId, tx), true)
    const log = await linhas(tx, sql`select detalhe, conta_id from log_acoes where tipo = 'transferencia_grupos_alterada' and usuario_id = ${geral.id}`)
    assert.equal(log.length, 1)
    assert.equal(log[0].conta_id, a.contaId)
    assert.deepEqual(log[0].detalhe, { contaId: a.contaId, contaNome: 'TG552 A', de: false, para: true })
  })
})

test('ligar numa Conta não liga na outra (A×B)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    const b = await semearConta(tx, 'B')
    const geral = await usuario(tx, 'admin_geral', null)
    await mod.alterarTransferenciaEntreGrupos(geral, a.contaId, true, tx)
    assert.equal(await mod.transferenciaEntreGruposLigada(b.contaId, tx), false)
  })
})

test('Conta inexistente: mesma resposta de sempre, sem log', async () => {
  await emTransacaoDesfeita(async tx => {
    const geral = await usuario(tx, 'admin_geral', null)
    assert.deepEqual(await mod.alterarTransferenciaEntreGrupos(geral, '00000000-0000-0000-0000-000000000000', true, tx), { ok: false, erro: 'Conta não encontrada' })
  })
})

test('destino de transferência: chave desligada nega; ligada, qualquer grupo da Conta da moto, nunca de outra', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    const b = await semearConta(tx, 'B')
    assert.equal(await mod.destinoEntreGruposPermitido(a.g1.lojaId, a.g2.lojaId, tx), false)
    const geral = await usuario(tx, 'admin_geral', null)
    await mod.alterarTransferenciaEntreGrupos(geral, a.contaId, true, tx)
    assert.equal(await mod.destinoEntreGruposPermitido(a.g1.lojaId, a.g2.lojaId, tx), true)
    assert.equal(await mod.destinoEntreGruposPermitido(a.g1.lojaId, b.g1.lojaId, tx), false)
  })
})

test('sócio da Conta A com grupo liberado da B (#520): moto da B não vai para loja da A, com qualquer chave ligada', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    const b = await semearConta(tx, 'B')
    const geral = await usuario(tx, 'admin_geral', null)
    // A chave que conta é a da Conta da moto; nem a da Conta do sócio nem a da B abrem a passagem entre Contas.
    await mod.alterarTransferenciaEntreGrupos(geral, a.contaId, true, tx)
    assert.equal(await mod.destinoEntreGruposPermitido(b.g1.lojaId, a.g1.lojaId, tx), false)
    await mod.alterarTransferenciaEntreGrupos(geral, b.contaId, true, tx)
    assert.equal(await mod.destinoEntreGruposPermitido(b.g1.lojaId, a.g1.lojaId, tx), false)
    assert.equal(await mod.destinoEntreGruposPermitido(b.g1.lojaId, b.g2.lojaId, tx), true)
  })
})

test('moto nova guarda o grupo da loja onde entrou, e não muda ao trocar de loja', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A')
    const [modelo] = await linhas(tx, sql`insert into modelos (marca, modelo, categoria, potencia_w, motor, velocidade_max) values ('M', 'TG552', 'autopropelido', '1000', 'hub', '32') returning id`)
    const chassi = 'TG552' + Math.floor(Math.random() * 1e9)
    const [m] = await linhas(tx, sql`insert into motos (chassi, modelo_id, loja_id, cor, nota_fiscal_entrada)
      values (${chassi}, ${modelo.id}, ${a.g1.lojaId}, 'Preta', '1') returning id, grupo_entrada_id`)
    assert.equal(m.grupo_entrada_id, a.g1.grupoId)
    await linhas(tx, sql`update motos set loja_id = ${a.g2.lojaId} where id = ${m.id}`)
    const [depois] = await linhas(tx, sql`select grupo_entrada_id from motos where id = ${m.id}`)
    assert.equal(depois.grupo_entrada_id, a.g1.grupoId)
  })
})
