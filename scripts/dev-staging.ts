/**
 * `npm run dev:staging`: sobe o `next dev` contra o mova-staging, sem herdar
 * nenhuma chave de outro .env que o .env.local não tenha (ver lib/env-staging.ts).
 *
 * Só sobe se banco e Supabase forem o staging (mesma trava do seed).
 * Argumentos extras vão para o next dev (ex.: `-- --turbopack`). Porta diferente
 * de 3000 exige mudar MOVA_URL/NEXT_PUBLIC_APP_URL no .env.local, senão
 * os links gerados apontam para a porta errada.
 */
import { spawn } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { parseEnv } from 'node:util'
import { loadEnvConfig } from '@next/env'
import { REF_STAGING, motivoRecusaForaDoStaging } from './lib/alvo-banco'
import { montarEnvStaging } from './lib/env-staging'

const ARQUIVO_STAGING = '.env.local'

// Antes do loadEnvConfig, que escreve no process.env deste processo.
const ambienteOriginal = { ...process.env }

let staging: Record<string, string>
try {
  // Aqui a diferença para o parser do Next erra para o lado seguro: linha que o
  // parseEnv não entende vira chave ausente, que é anulada ou fica de fora.
  staging = parseEnv(readFileSync(ARQUIVO_STAGING, 'utf8')) as Record<string, string>
} catch {
  // Sem detalhes: o conteúdo do arquivo é segredo.
  console.error(`Não consegui ler ${ARQUIVO_STAGING}`)
  process.exit(1)
}

const recusa = motivoRecusaForaDoStaging(staging.DATABASE_URL, staging.NEXT_PUBLIC_SUPABASE_URL)
if (recusa) {
  console.error(`Recusado (${ARQUIVO_STAGING}): ${recusa}`)
  process.exit(1)
}

// O próprio carregador do `next dev`: mesma lista de arquivos (inclusive o caso
// NODE_ENV=test) e mesmo parser. Só as chaves interessam; os valores são descartados.
const silencioso = { info: () => {}, error: () => {} } as unknown as Console
const { loadedEnvFiles } = loadEnvConfig(process.cwd(), true, silencioso, true)
const chavesDosOutros = loadedEnvFiles.flatMap(f => Object.keys(f.env))

const { env, anuladas } = montarEnvStaging(ambienteOriginal, staging, chavesDosOutros)

console.log(`STAGING (${REF_STAGING}) — sem dado real.`)
if (anuladas.length > 0) console.log(`Anuladas (vêm de outros .env, não do staging): ${anuladas.join(', ')}`)

const next = spawn('npx', ['next', 'dev', ...process.argv.slice(2)], { env: env as NodeJS.ProcessEnv, stdio: 'inherit' })
next.on('error', e => {
  console.error(`Não consegui iniciar o next dev: ${e.message}`)
  process.exit(1)
})
// Um SIGTERM só neste processo deixaria o next dev órfão, segurando a porta.
for (const sinal of ['SIGINT', 'SIGTERM'] as const) process.on(sinal, () => next.kill(sinal))
next.on('exit', (codigo, sinal) => {
  if (sinal) process.kill(process.pid, sinal)
  else process.exit(codigo ?? 1)
})
