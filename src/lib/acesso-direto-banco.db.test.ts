// Teste de banco: um login comum (o papel que o Supabase usa para usuário logado, com as claims
// de um usuário de verdade) não lê, não grava e não executa nada no schema public; quem acessa
// é só o app, pela conexão do Drizzle. Roda no Postgres descartável do CI, que recebe as
// permissões padrão do Supabase em supabase/ci-stubs.sql. Local: `npm run test:db:local`.
import { after, before, describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

// A migração roda de novo numa transação desfeita, sobre um objeto aberto de propósito.
describe('migração que fecha o acesso direto', () => {
  const migracao = sql.raw(readFileSync('src/lib/db/migrations/0187_login_sem_acesso_direto.sql', 'utf8'))
  const falhaCom = (trecho: RegExp) => (e: { cause?: { message?: string } }) => trecho.test(e.cause?.message ?? '')
  const pode = async (tx: Tx, q: SQL) => (await linhas(tx, sql`select (${q}) as pode`))[0].pode

  // Privilégio dado por outro papel, que recebeu o direito de repassar: o REVOKE do dono não o tira, como num
  // objeto de outro dono na produção. Só a conferência no fim da migração pega.
  async function abrirPorOutro(tx: Tx, privilegio: string, objeto: string, papel: string) {
    await tx.execute(sql.raw(`create role adb_conc nologin`))
    await tx.execute(sql.raw(`grant ${privilegio} on ${objeto} to adb_conc with grant option`))
    await tx.execute(sql.raw(`set local role adb_conc`))
    await tx.execute(sql.raw(`grant ${privilegio} on ${objeto} to ${papel}`))
    await tx.execute(sql.raw(`reset role`))
  }

  test('fecha também o que foi liberado a todos (PUBLIC)', async () => {
    await emTransacaoDesfeita(async tx => {
      await tx.execute(sql`create table adb891_publica (id int)`)
      await tx.execute(sql`grant select on adb891_publica to public`)
      await tx.execute(migracao)
      const [r] = await linhas(tx, sql`select has_table_privilege('authenticated', 'adb891_publica', 'SELECT') as pode`)
      assert.equal(r.pode, false)
    })
  })

  test('fecha também o acesso anônimo: tabela, sequência e padrão do schema', async () => {
    await emTransacaoDesfeita(async tx => {
      await tx.execute(sql`create table adb_t (id serial)`)
      await tx.execute(sql`grant select on adb_t to anon`)
      await tx.execute(sql.raw(`do $$ begin execute format('grant usage on sequence %s to anon', pg_get_serial_sequence('adb_t', 'id')); end $$`))
      await tx.execute(sql`alter default privileges in schema public grant select on tables to anon`)
      await tx.execute(migracao)
      assert.deepEqual({
        tabela: await pode(tx, sql`has_table_privilege('anon', 'adb_t', 'SELECT')`),
        sequencia: await pode(tx, sql`has_sequence_privilege('anon', pg_get_serial_sequence('adb_t', 'id'), 'USAGE')`),
        padrao: await pode(tx, sql`exists (select 1 from pg_default_acl d, aclexplode(d.defaclacl) a
          where d.defaclnamespace = 'public'::regnamespace and a.grantee = 'anon'::regrole)`),
      }, { tabela: false, sequencia: false, padrao: false })
    })
  })

  test('falha, e não grava nada, se sobrar tabela aberta', async () => {
    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql`create table adb_t (id int)`)
      await abrirPorOutro(tx, 'select', 'adb_t', 'anon')
      await tx.execute(migracao)
    }), falhaCom(/acesso direto aberto: anon public\.adb_t/))
  })

  test('falha se sobrar só uma coluna aberta', async () => {
    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql`create table adb_t (id int)`)
      await abrirPorOutro(tx, 'select (id)', 'adb_t', 'authenticated')
      await tx.execute(migracao)
    }), falhaCom(/acesso direto aberto: authenticated public\.adb_t/))
  })

  test('falha se o padrão global abrir objeto novo ao login comum', async () => {
    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql`alter default privileges for role postgres grant select on tables to authenticated`)
      await tx.execute(migracao)
    }), falhaCom(/padrão r para authenticated/))
  })

  test('falha se o padrão do schema abrir objeto novo a todos (PUBLIC)', async () => {
    await assert.rejects(db.transaction(async tx => {
      await tx.execute(sql`alter default privileges for role postgres in schema public grant select on tables to public`)
      await tx.execute(migracao)
    }), falhaCom(/padrão r para PUBLIC/))
  })
})
