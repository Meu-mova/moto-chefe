// Teste de banco: Postgres descartável, como src/lib/cliente-da-os.db.test.ts.
// Migração 0188 (#927): tira o gatilho do `auth.users` e apaga o schema; as tabelas do `crm` saem do realtime junto.
// O banco do CI não tem `auth.users` nem a publicação `supabase_realtime`: o teste cria os dois dentro da
// transação desfeita, junto com um `crm` mínimo, e roda o SQL do arquivo da migração.
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
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
const linhas = async (tx: Tx, q: ReturnType<typeof sql>) => ((await tx.execute(q)) as unknown as { rows: any[] }).rows

const MIGRACAO = readFileSync(join(process.cwd(), 'src/lib/db/migrations/0188_remover_crm.sql'), 'utf8')
const aplicar = (tx: Tx) => tx.execute(sql.raw(MIGRACAO))

const publicacaoComTabelaDeFora = (tx: Tx) => tx.execute(sql.raw(`
  do $$ begin
    if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
      create publication supabase_realtime;
    end if;
  end $$;
  create table public.t927_fora (id int primary key);
  alter publication supabase_realtime add table public.t927_fora;
`))

// O mínimo do que o teste do CRM deixou: schema, tabela, função, gatilho no cadastro de usuário e tabela no realtime.
const montarCrm = (tx: Tx) => tx.execute(sql.raw(`
  create table if not exists auth.users (id uuid primary key, email text);
  create schema crm;
  create table crm.profiles (id uuid primary key);
  create function crm.handle_new_user() returns trigger language plpgsql as $f$
    begin insert into crm.profiles (id) values (new.id); return new; end
  $f$;
  create trigger crm_on_auth_user_created after insert on auth.users for each row execute function crm.handle_new_user();
  alter publication supabase_realtime add table crm.profiles;
`))

const schemaCrm = async (tx: Tx) => (await linhas(tx, sql`select count(*)::int n from pg_namespace where nspname = 'crm'`))[0].n
const gatilhoCrm = async (tx: Tx) => (await linhas(tx, sql`select count(*)::int n from pg_trigger where tgname = 'crm_on_auth_user_created'`))[0].n
const noRealtime = async (tx: Tx) => (await linhas(tx, sql`select schemaname || '.' || tablename as t from pg_publication_tables
  where pubname = 'supabase_realtime' and (schemaname = 'crm' or tablename = 't927_fora') order by 1`)).map(l => l.t)
const novoUsuario = async (tx: Tx) => (await linhas(tx, sql`insert into auth.users (id) values (gen_random_uuid()) returning id`))[0].id as string

test('com o crm de pé: some o gatilho, o schema e as tabelas do crm no realtime; o resto do realtime fica', async () => {
  await emTransacaoDesfeita(async tx => {
    await publicacaoComTabelaDeFora(tx)
    await montarCrm(tx)
    await novoUsuario(tx)
    assert.equal((await linhas(tx, sql`select count(*)::int n from crm.profiles`))[0].n, 1, 'o gatilho do crm estava ativo')
    assert.deepEqual(await noRealtime(tx), ['crm.profiles', 'public.t927_fora'])

    await aplicar(tx)

    assert.equal(await schemaCrm(tx), 0)
    assert.equal(await gatilhoCrm(tx), 0)
    assert.deepEqual(await noRealtime(tx), ['public.t927_fora'])
  })
})

test('depois da migração, cadastrar usuário continua funcionando', async () => {
  await emTransacaoDesfeita(async tx => {
    await publicacaoComTabelaDeFora(tx)
    await montarCrm(tx)
    await aplicar(tx)
    const id = await novoUsuario(tx)
    assert.deepEqual(await linhas(tx, sql`select id from auth.users where id = ${id}`), [{ id }])
    assert.equal(await gatilhoCrm(tx), 0)
  })
})

test('rodar de novo e rodar num banco sem crm não dá erro e não mexe no resto do realtime', async () => {
  await emTransacaoDesfeita(async tx => {
    await publicacaoComTabelaDeFora(tx)
    await montarCrm(tx)
    await aplicar(tx)
    await aplicar(tx)
    assert.equal(await schemaCrm(tx), 0)
    assert.deepEqual(await noRealtime(tx), ['public.t927_fora'])
  })
  // Sem crm e sem auth.users, como no CI e no staging.
  await emTransacaoDesfeita(async tx => {
    await publicacaoComTabelaDeFora(tx)
    await aplicar(tx)
    assert.equal(await schemaCrm(tx), 0)
    assert.deepEqual(await noRealtime(tx), ['public.t927_fora'])
  })
})
