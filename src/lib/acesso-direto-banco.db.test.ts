// Teste de banco: um login comum (o papel que o Supabase usa para usuário logado, com as claims
// de um usuário de verdade) não lê, não grava e não executa nada no schema public; quem acessa
// é só o app, pela conexão do Drizzle. Roda no Postgres descartável do CI, que recebe as
// permissões padrão do Supabase em supabase/ci-stubs.sql. Local: `npm run test:db:local`.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { sql, type SQL } from 'drizzle-orm'
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

before(async () => {
  ;({ db } = await import('@/lib/db'))
})

after(async () => {
  await (globalThis as { __pgPool?: { end(): Promise<void> } }).__pgPool?.end()
})

class Desfazer extends Error {}

async function emTransacaoDesfeita(fn: (tx: Tx) => Promise<void>) {
  await assert.rejects(db.transaction(async tx => { await fn(tx); throw new Desfazer() }), Desfazer)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const linhas = async (tx: Tx, q: SQL) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows

const PERMISSAO_NEGADA = '42501'

/**
 * Roda `q` como o login comum do usuário, num savepoint: devolve `'ok'` se o banco aceitou e o
 * código do erro se recusou. O papel volta ao do app nos dois casos.
 */
async function comoLoginComum(tx: Tx, usuarioId: string, q: SQL): Promise<string> {
  try {
    await tx.transaction(async sp => {
      await sp.execute(sql`select set_config('request.jwt.claims', ${JSON.stringify({ sub: usuarioId, role: 'authenticated' })}, true)`)
      await sp.execute(sql`set local role authenticated`)
      await sp.execute(q)
      await sp.execute(sql`reset role`)
    })
    return 'ok'
  } catch (e) {
    return (e as { cause?: { code?: string } }).cause?.code ?? String(e)
  }
}

// Objetos criados por extensão ficam de fora: não são do app e não guardam dado dele.
const naoDeExtensao = (oid: SQL) => sql`not exists (select 1 from pg_depend d where d.objid = ${oid} and d.deptype = 'e')`

const tabelasDoPublic = (tx: Tx) => linhas(tx, sql`
  select c.oid, c.relkind, format('%I.%I', n.nspname, c.relname) as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f') and ${naoDeExtensao(sql`c.oid`)} order by 3`)

const funcoesDoPublic = (tx: Tx) => linhas(tx, sql`
  select p.oid, p.oid::regprocedure::text as nome, p.prosecdef, p.pronargs, p.prorettype::regtype::text as retorno
  from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and ${naoDeExtensao(sql`p.oid`)} order by 2`)

async function semearLoginDaContaA(tx: Tx) {
  const contaA = await semearContaBase(tx, { prefixo: 'ADB891', nome: 'A', cnpj: '00000000089101' })
  const contaB = await semearContaBase(tx, { prefixo: 'ADB891', nome: 'B', cnpj: '00000000089102' })
  await semearUsuario(tx, contaB, { papel: 'aux_adm', rotulo: 'aux' })
  return { contaA, contaB, vendedorA: await semearUsuario(tx, contaA, { papel: 'vendedor', rotulo: 'vend' }) }
}

describe('login comum direto no banco', () => {
  test('não lê nenhuma tabela ou view do public', async () => {
    await emTransacaoDesfeita(async tx => {
      const { vendedorA } = await semearLoginDaContaA(tx)
      const tabelas = await tabelasDoPublic(tx)
      assert.ok(tabelas.length > 50, 'a varredura achou as tabelas')
      const lidas = []
      for (const t of tabelas) {
        if (await comoLoginComum(tx, vendedorA, sql`select 1 from ${sql.raw(t.nome)} limit 1`) !== PERMISSAO_NEGADA) lidas.push(t.nome)
      }
      assert.deepEqual(lidas, [])
    })
  })

  test('não insere nem apaga em nenhuma tabela do public', async () => {
    await emTransacaoDesfeita(async tx => {
      const { vendedorA } = await semearLoginDaContaA(tx)
      // Views ficam no teste de privilégios abaixo.
      const tabelas = (await tabelasDoPublic(tx)).filter(t => ['r', 'p'].includes(t.relkind))
      const gravadas = []
      for (const t of tabelas) {
        const tabela = sql.raw(t.nome)
        // `where false`: a permissão é conferida antes de olhar linha; nada é gravado de fato.
        if (await comoLoginComum(tx, vendedorA, sql`insert into ${tabela} select * from ${tabela} where false`) !== PERMISSAO_NEGADA) gravadas.push(`insert ${t.nome}`)
        if (await comoLoginComum(tx, vendedorA, sql`delete from ${tabela} where false`) !== PERMISSAO_NEGADA) gravadas.push(`delete ${t.nome}`)
      }
      assert.deepEqual(gravadas, [])
    })
  })

  test('não tem privilégio em tabela, view ou sequência do public', async () => {
    await emTransacaoDesfeita(async tx => {
      const comPrivilegio = await linhas(tx, sql`
        select format('%I.%I', n.nspname, c.relname) as nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and ${naoDeExtensao(sql`c.oid`)} and (
          (c.relkind in ('r', 'p', 'v', 'm', 'f') and has_table_privilege('authenticated', c.oid, 'SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER'))
          or (c.relkind = 'S' and has_sequence_privilege('authenticated', c.oid, 'USAGE, SELECT, UPDATE')))
        order by 1`)
      assert.deepEqual(comPrivilegio.map(r => r.nome), [])
    })
  })

  test('nenhuma regra de acesso libera tudo', async () => {
    await emTransacaoDesfeita(async tx => {
      const amplas = await linhas(tx, sql`
        select tablename || '.' || policyname as nome from pg_policies
        where schemaname = 'public' and (qual = 'true' or with_check = 'true') order by 1`)
      assert.deepEqual(amplas.map(r => r.nome), [])
    })
  })

  test('não executa nenhuma função do public', async () => {
    await emTransacaoDesfeita(async tx => {
      const { vendedorA } = await semearLoginDaContaA(tx)
      const funcoes = await funcoesDoPublic(tx)
      const comExecute = []
      for (const f of funcoes) {
        for (const papel of ['authenticated', 'anon', 'public']) {
          const [r] = await linhas(tx, sql`select has_function_privilege(${papel}, ${f.oid}::oid, 'EXECUTE') as pode`)
          if (r.pode) comExecute.push(`${papel} ${f.nome}`)
        }
      }
      assert.deepEqual(comExecute, [])
      // Chamada de verdade, como o login: as que rodam com o poder do dono e não pedem argumento.
      const semArgumento = funcoes.filter(f => f.prosecdef && f.pronargs === 0 && !['trigger', 'event_trigger'].includes(f.retorno))
      assert.ok(semArgumento.length > 0, 'a varredura achou funções para chamar')
      const chamadas = []
      for (const f of semArgumento) {
        const nome = f.nome.replace(/\(\)$/, '')
        if (await comoLoginComum(tx, vendedorA, sql`select ${sql.raw(nome)}()`) !== PERMISSAO_NEGADA) chamadas.push(f.nome)
      }
      assert.deepEqual(chamadas, [])
    })
  })

  test('tabela, sequência e função novas não nascem abertas ao login comum', async () => {
    await emTransacaoDesfeita(async tx => {
      await tx.execute(sql`create table adb891_nova (id serial primary key)`)
      await tx.execute(sql`create function adb891_nova_fn() returns int language sql as 'select 1'`)
      const [r] = await linhas(tx, sql`select
        has_table_privilege('authenticated', 'adb891_nova', 'SELECT, INSERT, UPDATE, DELETE') as tabela,
        has_sequence_privilege('authenticated', pg_get_serial_sequence('adb891_nova', 'id'), 'USAGE, SELECT, UPDATE') as sequencia,
        has_function_privilege('authenticated', 'adb891_nova_fn()', 'EXECUTE') as funcao`)
      assert.deepEqual(r, { tabela: false, sequencia: false, funcao: false })
    })
  })
})

describe('o app e o service_role seguem com acesso', () => {
  test('a conexão do app lê o que o login comum não lê', async () => {
    await emTransacaoDesfeita(async tx => {
      const { contaB } = await semearLoginDaContaA(tx)
      const [loja] = await linhas(tx, sql`select nome from lojas where id = ${contaB.lojaId}`)
      assert.equal(loja.nome, 'Loja ADB891 B')
    })
  })

  test('service_role mantém tabelas e funções do public', async () => {
    await emTransacaoDesfeita(async tx => {
      const faltando = []
      for (const t of await tabelasDoPublic(tx)) {
        const [r] = await linhas(tx, sql`select has_table_privilege('service_role', ${t.oid}::oid, 'SELECT, INSERT, UPDATE, DELETE') as pode`)
        if (!r.pode) faltando.push(t.nome)
      }
      for (const f of await funcoesDoPublic(tx)) {
        const [r] = await linhas(tx, sql`select has_function_privilege('service_role', ${f.oid}::oid, 'EXECUTE') as pode`)
        if (!r.pode) faltando.push(f.nome)
      }
      assert.deepEqual(faltando, [])
    })
  })
})
