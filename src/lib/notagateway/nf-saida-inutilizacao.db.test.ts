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
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
type Mod = typeof import('@/lib/notagateway/inutilizar')
let db: Db['db']
let m: Mod

before(async () => {
  ;({ db } = await import('@/lib/db'))
  m = await import('@/lib/notagateway/inutilizar')
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

const JUSTIFICATIVA = 'Venda cancelada após a rejeição da nota'

async function semearConta(tx: Tx, nome: string, cnpj: string) {
  const [conta] = await linhas(tx, sql`insert into contas (nome) values (${'IN504 ' + nome}) returning id`)
  const [grupo] = await linhas(tx, sql`insert into grupos (nome, cnpj, conta_id) values (${'IN504 ' + nome}, ${cnpj}, ${conta.id}) returning id`)
  const [loja] = await linhas(tx, sql`insert into lojas (nome, cidade, endereco, grupo_id) values (${'Loja IN504 ' + nome}, 'C', 'R', ${grupo.id}) returning id`)
  const usuario = async (papel: string) => {
    const [u] = await linhas(tx, sql`insert into usuarios (id, nome, email, papel, loja_id)
      values (gen_random_uuid(), ${papel}, ${`${papel}-in504${nome}@teste.invalid`}, ${papel}, ${loja.id}) returning id`)
    return { id: u.id as string, papel, lojaId: loja.id as string, gruposAcesso: null, contaId: conta.id as string }
  }
  return { grupoId: grupo.id as string, socio: await usuario('admin_socio'), aux: await usuario('aux_adm') }
}

async function semearNotaNegada(tx: Tx, grupoId: string, vendaNumero: number, numero = '974') {
  const [nota] = await linhas(tx, sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, motivo_status, numero, serie, payload)
    values (null, ${vendaNumero}, ${grupoId}, ${`in504-${vendaNumero}-1`}, 'Homologacao', 'Negada', '225 - Falha no schema', ${numero}, '1', '{}'::jsonb) returning id`)
  return nota.id as string
}

const inutilizacoes = (tx: Tx, notaId: string) => linhas(tx, sql`select * from notas_fiscais_saida_inutilizacoes where nota_id = ${notaId}`)

test('a Conta B não pede inutilização da nota da Conta A, e recebe a mesma frase do id inexistente (#504)', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950401)

    const deB = await m.prepararInutilizacao(tx, b.socio, notaA, JUSTIFICATIVA)
    const inexistente = await m.prepararInutilizacao(tx, b.socio, '00000000-0000-0000-0000-000000000000', JUSTIFICATIVA)
    assert.deepEqual(deB, { ok: false, erro: 'NF não encontrada' })
    assert.deepEqual(inexistente, deB)
    assert.equal((await inutilizacoes(tx, notaA)).length, 0)
  })
})

test('a Conta B não vê nem sobrescreve a inutilização da Conta A', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950402)
    const r = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.ok(r.ok)
    const id = r.pedido.inutilizacaoId

    assert.equal(await m.inutilizacaoDoUsuario(tx, b.socio, id), null)
    assert.equal((await m.inutilizacaoDoUsuario(tx, a.socio, id))?.id, id)
    // Gravação com o grupo da B no where não acha a linha da A.
    await m.gravarResultadoDaInutilizacao(tx, { id, grupoId: b.grupoId }, { status: 'InutilizacaoAutorizada', motivoStatus: null, protocolo: 'P-B' })
    const [linha] = await inutilizacoes(tx, notaA)
    assert.equal(linha.situacao, 'pendente')
    assert.equal(linha.protocolo, null)
  })
})

test('o sócio da Conta pede: grava a faixa da própria nota, no grupo da nota, com a justificativa sem acento', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950403)
    const r = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.ok(r.ok)
    const [linha] = await inutilizacoes(tx, notaA)
    assert.equal(linha.grupo_id, a.grupoId)
    assert.deepEqual([linha.serie, linha.numero_inicial, linha.numero_final], ['1', 974, 974])
    assert.equal(linha.justificativa, 'Venda cancelada apos a rejeicao da nota')
    assert.equal(linha.situacao, 'pendente')
  })
})

test('o aux_adm não inutiliza, nem na própria Conta', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950404)
    assert.deepEqual(await m.prepararInutilizacao(tx, a.aux, notaA, JUSTIFICATIVA), { ok: false, erro: 'NF não encontrada' })
  })
})

test('o mesmo número não se pede duas vezes; negada libera um novo pedido', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950405)
    const primeiro = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.ok(primeiro.ok)
    assert.equal((await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)).ok, false)

    await m.gravarResultadoDaInutilizacao(tx, { id: primeiro.pedido.inutilizacaoId, grupoId: a.grupoId },
      { status: 'InutilizacaoNegada', motivoStatus: 'Faixa já utilizada', protocolo: null })
    const segundo = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.ok(segundo.ok)
    assert.notEqual(segundo.pedido.idExterno, primeiro.pedido.idExterno)
    assert.equal((await inutilizacoes(tx, notaA)).length, 2)
  })
})

test('pedido que não chegou à NG (marcado não enviado) libera o número para outro pedido', async () => {
  const { STATUS_NAO_ENVIADA, STATUS_SEM_CONFIGURACAO } = await import('@/lib/notagateway/inutilizacao')
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950406)
    for (const status of [STATUS_SEM_CONFIGURACAO, STATUS_NAO_ENVIADA]) {
      const r = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
      assert.ok(r.ok, status)
      await m.gravarResultadoDaInutilizacao(tx, { id: r.pedido.inutilizacaoId, grupoId: a.grupoId }, { status, motivoStatus: 'x', protocolo: null })
    }
    assert.equal((await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)).ok, true)
    const status = (await inutilizacoes(tx, notaA)).map(l => `${l.status}:${l.situacao}`).sort()
    assert.deepEqual(status, ['Enviando:pendente', 'NaoEnviada:negada', 'SemConfiguracao:negada'])
  })
})

test('número em nota autorizada do mesmo grupo e série recusa antes do envio; o mesmo número em outro grupo não', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950410, '0976')
    const notaB = await semearNotaNegada(tx, b.grupoId, 950411, '976')
    await linhas(tx, sql`insert into notas_fiscais_saida (venda_id, venda_numero, grupo_id, id_externo, ambiente, status, numero, serie, payload)
      values (null, 950412, ${a.grupoId}, 'in504-950412-1', 'Homologacao', 'Autorizada', '976', '1', '{}'::jsonb)`)

    const r = await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)
    assert.equal(r.ok, false)
    assert.match((r as { erro: string }).erro, /976 está em outra nota/)
    assert.equal((await inutilizacoes(tx, notaA)).length, 0, 'nada gravado')

    assert.ok((await m.prepararInutilizacao(tx, b.socio, notaB, JUSTIFICATIVA)).ok, 'a autorizada da A não trava o número da B')
  })
})

test('lista de notas emitidas: a recusada elegível pode ser inutilizada até o pedido, que aparece pendente; a Conta B não vê', async () => {
  await emTransacaoDesfeita(async tx => {
    const { listarNotasEmitidas } = await import('@/lib/queries/notas-emitidas')
    const a = await semearConta(tx, 'A', '00000000050401')
    const b = await semearConta(tx, 'B', '00000000050402')
    const notaA = await semearNotaNegada(tx, a.grupoId, 950420)
    const hoje = new Date().toISOString().slice(0, 10)
    const filtro = (grupoId: string, contaId: string) => ({ grupoId, contaId, ambiente: 'Homologacao' as const, de: '2000-01-01', ate: hoje })
    const daA = async () => (await listarNotasEmitidas(filtro(a.grupoId, a.socio.contaId), tx)).find(n => n.id === notaA)!

    assert.equal((await daA()).podeInutilizar, true)
    assert.equal((await daA()).inutilizacao, null)
    assert.ok((await m.prepararInutilizacao(tx, a.socio, notaA, JUSTIFICATIVA)).ok)
    assert.equal((await daA()).podeInutilizar, false)
    assert.equal((await daA()).inutilizacao?.situacao, 'pendente')

    assert.equal((await listarNotasEmitidas(filtro(a.grupoId, b.socio.contaId), tx)).length, 0, 'B pedindo o grupo da A não lista nada')
  })
})
