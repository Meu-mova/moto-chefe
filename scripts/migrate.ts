/**
 * Aplica as migrações de src/lib/db/migrations que ainda não rodaram no banco
 * da DATABASE_URL, e anota cada uma em public.schema_migrations.
 *
 * Uso (staging):
 *   npx dotenv-cli -e .env.staging.local -- node --import tsx scripts/migrate.ts --status
 *   npx dotenv-cli -e .env.staging.local -- node --import tsx scripts/migrate.ts --aplicar
 * Na produção, o mesmo comando com o env da prod e --prod no fim.
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
import { descreverAlvo, motivoRecusaProducao, rotuloAlvo } from './lib/alvo-banco'
import {
  arquivosDoBaseline, checksumDe, filtrarArquivosMigracao, planejar,
  type ArquivoMigracao, type RegistroMigracao,
} from './lib/migracoes'

const PASTA = resolve(process.cwd(), 'src/lib/db/migrations')

const args = process.argv.slice(2)
const temProd = args.includes('--prod')
const idxBaseline = args.indexOf('--baseline-ate')
const modo = args.includes('--status') ? 'status'
  : args.includes('--aplicar') ? 'aplicar'
  : idxBaseline >= 0 ? 'baseline'
  : null
const limiteBaseline = idxBaseline >= 0 ? parseInt(args[idxBaseline + 1], 10) : NaN

if (!modo || (modo === 'baseline' && isNaN(limiteBaseline))) {
  console.error('Uso: scripts/migrate.ts --status | --aplicar | --baseline-ate <NNNN>  [--prod]')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida — rode via `npx dotenv-cli -e <arquivo .env> -- ...`')
  process.exit(1)
}

const alvo = descreverAlvo(process.env.DATABASE_URL)
console.log(rotuloAlvo(alvo))
const recusa = motivoRecusaProducao(alvo, temProd)
if (recusa) {
  console.error(recusa)
  process.exit(1)
}

const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

function lerArquivos(): (ArquivoMigracao & { conteudo: string })[] {
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

async function baseline() {
  if (await tabelaExiste()) {
    const [{ n }] = await sql`select count(*)::int as n from public.schema_migrations`
    if (n > 0) throw new Error(`schema_migrations já tem ${n} registros — o baseline só roda uma vez por banco`)
  }
  const marcados = arquivosDoBaseline(lerArquivos(), limiteBaseline)
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
    for (const m of marcados) {
      await tx`insert into public.schema_migrations (arquivo, checksum) values (${m.arquivo}, ${m.checksum})`
    }
  })
  console.log(`Baseline registrado: ${marcados.length} arquivos (até ${String(limiteBaseline).padStart(4, '0')}).`)
}

async function status(aplicar: boolean) {
  if (!(await tabelaExiste())) {
    throw new Error('Este banco não tem public.schema_migrations — rode --baseline-ate antes')
  }
  const arquivos = lerArquivos()
  const plano = planejar(arquivos, await lerRegistros())

  if (plano.problemas.length > 0) {
    console.error('Banco e repo discordam — nada foi aplicado:')
    for (const p of plano.problemas) console.error(`  - ${p}`)
    process.exitCode = 1
    return
  }
  if (plano.pendentes.length === 0) {
    console.log('Nada pendente.')
    return
  }
  console.log(`Pendentes (${plano.pendentes.length}):`)
  for (const p of plano.pendentes) console.log(`  - ${p.arquivo}`)
  if (!aplicar) return

  const conteudoDe = new Map(arquivos.map(a => [a.arquivo, a.conteudo]))
  for (const p of plano.pendentes) {
    await sql.begin(async tx => {
      await tx.unsafe(conteudoDe.get(p.arquivo)!).simple()
      await tx`insert into public.schema_migrations (arquivo, checksum) values (${p.arquivo}, ${p.checksum})`
    })
    console.log(`  ✓ ${p.arquivo}`)
  }
}

async function main() {
  if (modo === 'baseline') await baseline()
  else await status(modo === 'aplicar')
  await sql.end()
}

main().catch(async (e: unknown) => {
  console.error('FALHOU:', e instanceof Error ? e.message : String(e))
  await sql.end({ timeout: 5 })
  process.exit(1)
})
