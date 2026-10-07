/**
 * Aplica as migrações de src/lib/db/migrations que ainda não rodaram no banco
 * da DATABASE_URL, e anota cada uma em public.schema_migrations.
 *
 * Uso (staging):
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/migrate.ts --status
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/migrate.ts --aplicar
 * Na produção: npx dotenv-cli -e .env.prod.local -- node --import tsx scripts/migrate.ts --aplicar --prod
 * No CI (migracoes.yml), contra o staging: --aplicar --exigir-staging (recusa qualquer outro banco).
 *
 * Uma vez por banco, para registrar o que já existia antes desta tabela:
 *   ... scripts/migrate.ts --baseline-ate 110
 *
 * Um arquivo por transação, com o registro dentro dela: se o SQL falhar, nem a
 * mudança nem a anotação ficam. Por isso uma migração que faz ALTER TYPE ... ADD
 * VALUE não pode usar o valor novo no mesmo arquivo — separe em dois.
 */
import { readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import postgres from 'postgres'
import { exigirAlvoPermitido, REF_STAGING } from './lib/alvo-banco'
import {
  arquivosDoBaseline, checksumDe, filtrarArquivosMigracao, planejar, temControleDeTransacao,
  type ArquivoMigracao, type RegistroMigracao,
} from './lib/migracoes'

const PASTA = resolve(process.cwd(), 'src/lib/db/migrations')
const USO = 'Uso: scripts/migrate.ts --status | --aplicar | --baseline-ate <NNNN>  [--prod | --exigir-staging]'

const args = process.argv.slice(2)
const temProd = args.includes('--prod')
const exigirStaging = args.includes('--exigir-staging')
const modos = ['--status', '--aplicar', '--baseline-ate'].filter(m => args.includes(m))
const valorBaseline = args[args.indexOf('--baseline-ate') + 1] ?? ''

if (modos.length !== 1 || (modos[0] === '--baseline-ate' && !/^\d+$/.test(valorBaseline)) || (temProd && exigirStaging)) {
  console.error(USO)
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida — rode via `npx dotenv-cli -e <arquivo .env> -- ...`')
  process.exit(1)
}

// CI=true: aceita o Postgres descartável do migracoes.yml em localhost (ver alvo-banco.ts).
const alvo = exigirAlvoPermitido(process.env.DATABASE_URL, temProd, process.env.CI === 'true')
if (exigirStaging && alvo.ref !== REF_STAGING) {
  console.error(`Recusado: --exigir-staging, e o banco não é o mova-staging (${REF_STAGING}).`)
  process.exit(1)
}
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

type ArquivoComConteudo = ArquivoMigracao & { conteudo: string }

function lerArquivos(): ArquivoComConteudo[] {
  return filtrarArquivosMigracao(readdirSync(PASTA)).map(arquivo => {
    const conteudo = readFileSync(resolve(PASTA, arquivo), 'utf8')
    return { arquivo, checksum: checksumDe(conteudo), conteudo }
  })
}

async function tabelaExiste(): Promise<boolean> {
  const [r] = await sql`select to_regclass('public.schema_migrations') is not null as existe`
  return r.existe
}

async function lerRegistros(): Promise<RegistroMigracao[]> {
  return sql<RegistroMigracao[]>`select arquivo, checksum from public.schema_migrations order by arquivo`
}

async function registrar(tx: postgres.TransactionSql, m: ArquivoMigracao) {
  await tx`insert into public.schema_migrations (arquivo, checksum) values (${m.arquivo}, ${m.checksum})`
}

async function baseline(limite: number) {
  if (await tabelaExiste()) {
    const [{ n }] = await sql`select count(*)::int as n from public.schema_migrations`
    if (n > 0) throw new Error(`schema_migrations já tem ${n} registros — o baseline só roda uma vez por banco`)
  }
  const marcados = arquivosDoBaseline(lerArquivos(), limite)
  await sql.begin(async tx => {
    await tx.unsafe(`
      create table if not exists public.schema_migrations (
        arquivo     text primary key,
        aplicado_em timestamptz not null default now(),
        checksum    text not null
      );
      alter table public.schema_migrations enable row level security;
      -- Só o dono do banco lê e escreve; nada disto passa pela Data API.
      revoke all on public.schema_migrations from anon, authenticated;
    `).simple()
    for (const m of marcados) await registrar(tx, m)
  })
  console.log(`Baseline registrado: ${marcados.length} arquivos (até ${String(limite).padStart(4, '0')}).`)
}

/** Lista o que falta. Devolve os pendentes só se nada impedir aplicá-los. */
async function status(): Promise<ArquivoComConteudo[] | null> {
  if (!(await tabelaExiste())) {
    throw new Error('Este banco não tem public.schema_migrations — rode --baseline-ate antes')
  }
  const plano = planejar(lerArquivos(), await lerRegistros())
  const problemas = [
    ...plano.problemas,
    ...plano.pendentes
      .filter(p => temControleDeTransacao(p.conteudo))
      .map(p => `BEGIN/COMMIT dentro do arquivo (o migrate.ts já abre a transação): ${p.arquivo}`),
  ]

  if (problemas.length > 0) {
    console.error('Banco e repo discordam — nada foi aplicado:')
    for (const p of problemas) console.error(`  - ${p}`)
    process.exitCode = 1
    return null
  }
  if (plano.pendentes.length === 0) {
    console.log('Nada pendente.')
    return []
  }
  console.log(`Pendentes (${plano.pendentes.length}):`)
  for (const p of plano.pendentes) console.log(`  - ${p.arquivo}`)
  for (const f of plano.foraDeOrdem) {
    console.log(`  ! ${f} tem número abaixo de uma migração já aplicada — confira se a ordem importa`)
  }
  return plano.pendentes
}

async function aplicar() {
  const pendentes = await status()
  if (!pendentes) return
  for (const p of pendentes) {
    await sql.begin(async tx => {
      await tx.unsafe(p.conteudo).simple()
      await registrar(tx, p)
    })
    console.log(`  ✓ ${p.arquivo}`)
  }
}

async function main() {
  if (modos[0] === '--baseline-ate') await baseline(parseInt(valorBaseline, 10))
  else if (modos[0] === '--aplicar') await aplicar()
  else await status()
  await sql.end()
}

main().catch(async (e: unknown) => {
  console.error('FALHOU:', e instanceof Error ? e.message : String(e))
  await sql.end({ timeout: 5 })
  process.exit(1)
})
