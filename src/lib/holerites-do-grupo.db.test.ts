// Teste de banco: Postgres descartável, como src/lib/agendamento-do-usuario.db.test.ts.
// Conta B nunca lê, apaga nem sobrescreve holerite da Conta A (#634).
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql } from 'drizzle-orm'
import { semearContaBase, semearUsuario } from '@/test/semear-conta'

const url = process.env.TEST_DATABASE_URL
if (!url) throw new Error('TEST_DATABASE_URL não definida — este teste só roda num Postgres descartável')
if (!['localhost', '127.0.0.1'].includes(new URL(url).hostname)) {
  throw new Error('TEST_DATABASE_URL precisa ser loopback (Postgres descartável)')
}
process.env.DATABASE_URL = url

type Db = typeof import('@/lib/db')
type Tx = Parameters<Parameters<Db['db']['transaction']>[0]>[0]
let db: Db['db']
let helpers: typeof import('@/lib/holerites-do-grupo')

before(async () => {
  ;({ db } = await import('@/lib/db'))
  helpers = await import('@/lib/holerites-do-grupo')
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
  const base = await semearContaBase(tx, { prefixo: 'HOL634', nome, cnpj })
  const funcionarioId = await semearUsuario(tx, base, { papel: 'mecanico', rotulo: 'func' })
  const [h] = await linhas(tx, sql`insert into holerites (usuario_id, mes, tipo, arquivo_path, arquivo_nome, tamanho)
    values (${funcionarioId}, '2026-10', 'salario', ${`${base.grupoId}/2026-10/f.pdf`}, 'f.pdf', 10) returning id`)
  return { base, funcionarioId, holeriteId: h.id as string, grupoId: base.grupoId, arquivoPath: `${base.grupoId}/2026-10/f.pdf` }
}

// Registra quantas linhas cada consulta devolveu: prova que a leitura já vem filtrada pela
// Conta, e não que o registro de outra Conta foi lido e descartado depois.
function comLeituraRegistrada(tx: Tx) {
  const lidas: number[] = []
  const envolver = (alvo: object): object => new Proxy(alvo, {
    get(obj, prop) {
      if (prop === 'then') {
        return (ok: (v: unknown) => unknown, erro: (e: unknown) => unknown) =>
          (obj as unknown as Promise<unknown[]>).then(rows => { lidas.push(rows.length); return rows }).then(ok, erro)
      }
      const v = Reflect.get(obj, prop)
      return typeof v === 'function' ? (...args: unknown[]) => {
        const r = v.apply(obj, args)
        return r && typeof r === 'object' ? envolver(r) : r
      } : v
    },
  })
  const exec = { select: (...a: unknown[]) => envolver((tx.select as (...x: unknown[]) => object)(...a)), delete: (...a: unknown[]) => envolver((tx.delete as (...x: unknown[]) => object)(...a)) }
  return { exec: exec as unknown as Tx, lidas }
}

test('a própria Conta acha o funcionário e o holerite', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000063401')
    assert.equal((await helpers.funcionarioDoGrupo(a.grupoId, a.funcionarioId, tx))?.lojaId, a.base.lojaId)
    assert.equal((await helpers.holeriteDoGrupo(a.grupoId, a.holeriteId, tx))?.arquivoPath, a.arquivoPath)
  })
})

test('Conta B não acha funcionário nem holerite da A, igual a id inexistente', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000063402')
    const b = await semearConta(tx, 'B', '00000000063403')
    assert.equal(await helpers.funcionarioDoGrupo(b.grupoId, a.funcionarioId, tx), null)
    assert.equal(await helpers.funcionarioDoGrupo(b.grupoId, crypto.randomUUID(), tx), null)
    assert.equal(await helpers.holeriteDoGrupo(b.grupoId, a.holeriteId, tx), null)
    assert.equal(await helpers.holeriteDoGrupo(b.grupoId, crypto.randomUUID(), tx), null)
  })
})

test('Conta B não remove holerite da A: a linha continua e nenhum caminho é devolvido', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000063404')
    const b = await semearConta(tx, 'B', '00000000063405')
    assert.equal(await helpers.removerHoleriteDoGrupo(b.grupoId, a.holeriteId, tx), null)
    const [h] = await linhas(tx, sql`select arquivo_path, arquivo_nome, enviado_por from holerites where id = ${a.holeriteId}`)
    assert.deepEqual(h, { arquivo_path: a.arquivoPath, arquivo_nome: 'f.pdf', enviado_por: null })
    assert.equal(await helpers.removerHoleriteDoGrupo(a.grupoId, a.holeriteId, tx), a.arquivoPath)
    assert.equal((await linhas(tx, sql`select 1 from holerites where id = ${a.holeriteId}`)).length, 0)
  })
})

test('a lista da Conta B não traz o holerite da A; a da A traz o seu', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000063409')
    const b = await semearConta(tx, 'B', '00000000063410')
    assert.deepEqual((await helpers.listarHoleritesDoGrupo(a.grupoId, '2026-10', tx)).map(h => h.id), [a.holeriteId])
    assert.deepEqual((await helpers.listarHoleritesDoGrupo(b.grupoId, '2026-10', tx)).map(h => h.id), [b.holeriteId])
    assert.deepEqual(await helpers.listarHoleritesDoGrupo(b.grupoId, '2026-09', tx), [])
  })
})

test('funcionário sem loja não pertence a nenhum grupo', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000063406')
    const semLoja = await semearUsuario(tx, a.base, { papel: 'mecanico', rotulo: 'semloja', semLoja: true })
    assert.equal(await helpers.funcionarioDoGrupo(a.grupoId, semLoja, tx), null)
  })
})

test('a leitura já vem filtrada: registro de outra Conta nem chega a ser lido', async () => {
  await emTransacaoDesfeita(async tx => {
    const a = await semearConta(tx, 'A', '00000000063407')
    const b = await semearConta(tx, 'B', '00000000063408')
    const { exec, lidas } = comLeituraRegistrada(tx)
    await helpers.funcionarioDoGrupo(b.grupoId, a.funcionarioId, exec)
    await helpers.holeriteDoGrupo(b.grupoId, a.holeriteId, exec)
    await helpers.removerHoleriteDoGrupo(b.grupoId, a.holeriteId, exec)
    assert.deepEqual(lidas, [0, 0, 0])
  })
})
