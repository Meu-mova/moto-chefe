/**
 * `npm run dev:staging`: sobe o `next dev` contra o mova-staging, sem herdar
 * nenhuma chave da produção que o .env.local tenha e o staging não.
 *
 * Só sobe se banco e Supabase forem o staging (mesma lista de permissão do seed).
 * Argumentos extras vão para o next dev: `npm run dev:staging -- --port 3001`.
 */
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { descreverAlvo, REF_STAGING } from './lib/alvo-banco'
import { ARQUIVOS_ENV_DO_NEXT_DEV, montarEnvStaging } from './lib/env-staging'

const ARQUIVO_STAGING = '.env.staging.local'

function lerEnv(arquivo: string): Record<string, string> {
  try {
    return parseEnv(readFileSync(arquivo, 'utf8')) as Record<string, string>
  } catch {
    // Sem detalhes: o conteúdo do arquivo é segredo.
    console.error(`Não consegui ler ${arquivo}`)
    process.exit(1)
  }
}

const staging = lerEnv(ARQUIVO_STAGING)
const refBanco = staging.DATABASE_URL ? descreverAlvo(staging.DATABASE_URL).ref : null
const refSupabase = staging.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(staging.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
  : null
if (refBanco !== REF_STAGING || refSupabase !== REF_STAGING) {
  console.error(`Recusado: ${ARQUIVO_STAGING} precisa apontar banco e Supabase para o mova-staging (${REF_STAGING}). `
    + `Banco: ${refBanco ?? '?'}, Supabase: ${refSupabase ?? '?'}.`)
  process.exit(1)
}

const chavesDosOutros = ARQUIVOS_ENV_DO_NEXT_DEV
  .filter(a => existsSync(a))
  .flatMap(a => Object.keys(lerEnv(a)))
const { env, anuladas } = montarEnvStaging(process.env, staging, chavesDosOutros)

console.log(`STAGING (${REF_STAGING}) — sem dado real.`)
if (anuladas.length > 0) console.log(`Anuladas (vêm de outros .env, não do staging): ${anuladas.join(', ')}`)

const next = spawn('npx', ['next', 'dev', ...process.argv.slice(2)], { env: env as NodeJS.ProcessEnv, stdio: 'inherit' })
next.on('exit', codigo => process.exit(codigo ?? 0))
