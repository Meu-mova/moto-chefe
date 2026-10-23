/**
 * Prova na Nota Gateway REAL, em HOMOLOGAÇÃO, o que o suporte afirmou (#347):
 *   1. NF-e Negada pela SEFAZ, corrigida e reenviada com o MESMO id, sai com o MESMO número.
 *   2. POST recusado pela própria NG (400, JSON inválido) não registra o id nem consome
 *      número: o mesmo id corrigido é aceito e o número é o seguinte ao da nota anterior.
 * No fim cancela as duas autorizadas. Requests e testes em
 * scripts/postman/nf-reenvio-homologacao.postman_collection.json.
 *
 * Uso (só staging; credencial do "Grupo Teste Sul", que precisa estar em Homologacao):
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/ng-reenvio-homologacao.ts --dry-run
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/ng-reenvio-homologacao.ts
 *
 * Consome 2 números da série de homologação da empresa na NG. Requer o Postman CLI
 * (`npm install -g postman-cli`); não usa login nem POSTMAN_API_KEY.
 */
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import postgres from 'postgres'
import { descreverAlvo, motivoRecusaForaDoStaging, rotuloAlvo } from './lib/alvo-banco'
import { decifrar } from '../src/lib/cripto'

const GRUPO = 'Grupo Teste Sul'
const COLECAO = resolve(process.cwd(), 'scripts/postman/nf-reenvio-homologacao.postman_collection.json')
const dryRun = process.argv.includes('--dry-run')

const mascarar = (s: string) => (s.length <= 8 ? '****' : `${s.slice(0, 4)}…${s.slice(-4)}`)

async function main() {
  const databaseUrl = process.env.DATABASE_URL
  if (!databaseUrl) throw new Error('DATABASE_URL não definida — rode via `npx dotenv-cli -e .env.local -- ...`')
  console.error(rotuloAlvo(descreverAlvo(databaseUrl)))
  const recusa = motivoRecusaForaDoStaging(databaseUrl, process.env.NEXT_PUBLIC_SUPABASE_URL)
  if (recusa) throw new Error(recusa)

  const sql = postgres(databaseUrl, { max: 1, prepare: false, connect_timeout: 15 })
  let cfg: { token: string; empresa_id: string | null; ambiente: string } | undefined
  try {
    const linhas = await sql<{ token: string; empresa_id: string | null; ambiente: string }[]>`
      select c.token, c.empresa_id, c.ambiente
      from notagateway_config c join grupos g on g.id = c.grupo_id
      where g.nome = ${GRUPO}`
    if (linhas.length !== 1) throw new Error(`Esperava 1 notagateway_config para "${GRUPO}", achei ${linhas.length}`)
    cfg = linhas[0]
  } finally {
    await sql.end({ timeout: 5 })
  }
  if (cfg.ambiente !== 'Homologacao') throw new Error(`"${GRUPO}" está em ${cfg.ambiente}; este teste só roda em Homologacao`)
  if (!cfg.empresa_id) throw new Error(`"${GRUPO}" sem empresaId na Nota Gateway`)
  const token = decifrar(cfg.token).toString('utf8')
  if (!token) throw new Error('Token decifrado vazio')

  // Curto de propósito: id longo a NG devolve 500 (ver idExternoNfe).
  const idTeste = `mova-homolog-rv-${Date.now().toString(36)}`
  const args = (envFile: string) => [
    'collection', 'run', COLECAO,
    '--environment', envFile,
    '--env-var', 'baseUrl=https://api.notagateway.com.br/v2',
    '--env-var', `idTeste=${idTeste}`,
    '--no-report-events',
  ]

  console.error(`Grupo: ${GRUPO} | ambiente: ${cfg.ambiente} | empresaId: ${mascarar(cfg.empresa_id)} | token: decifrado (${token.length} caracteres)`)
  // Token e empresaId vão num environment temporário (0600), não em --env-var: argumento
  // de processo aparece no `ps` de qualquer usuário da máquina.
  const exibido = ['postman', ...args('<tmp>/ng.postman_environment.json (token=****, empresaId=' + mascarar(cfg.empresa_id) + ')')]
  console.error(`Comando: ${exibido.join(' ')}`)
  if (dryRun) {
    console.error('--dry-run: config válida; nada enviado à Nota Gateway.')
    return
  }

  const dir = mkdtempSync(join(tmpdir(), 'ng-reenvio-'))
  const envFile = join(dir, 'ng.postman_environment.json')
  try {
    writeFileSync(envFile, JSON.stringify({
      name: 'ng-homologacao-temporario',
      values: [
        { key: 'token', value: token, type: 'secret', enabled: true },
        { key: 'empresaId', value: cfg.empresa_id, type: 'default', enabled: true },
      ],
    }), { mode: 0o600 })
    const codigo = await new Promise<number>((ok, falha) => {
      const p = spawn('postman', args(envFile), { stdio: 'inherit' })
      p.on('error', falha)
      p.on('exit', c => ok(c ?? 1))
    })
    process.exitCode = codigo
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

main().catch((e: unknown) => {
  console.error('FALHOU:', e instanceof Error ? e.message : String(e))
  process.exit(1)
})
