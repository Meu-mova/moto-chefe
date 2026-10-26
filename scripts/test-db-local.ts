/**
 * Roda o `test:db` num Postgres descartável próprio, como o job `banco` do ci.yml:
 * porta livre e diretório temporário, para não colidir com outra sessão que já
 * tenha um Postgres de teste de pé.
 *
 *   npm run test:db:local              # sobe, migra, testa, derruba e apaga
 *   npm run test:db:local -- --manter  # deixa de pé e mostra como repetir e derrubar
 *
 * Precisa de initdb, pg_ctl e psql no PATH (Homebrew: `brew install postgresql`).
 * O migrate.ts só aceita loopback com CI=true; aqui ele vai só para o Postgres que
 * este script acabou de subir, na porta que o pg_ctl conseguiu ocupar.
 */
import { spawn, spawnSync, type ChildProcess, type SpawnOptions } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const manter = process.argv.includes('--manter')

const SAIDA_POR_SINAL = { SIGINT: 130, SIGTERM: 143 } as const
type Sinal = keyof typeof SAIDA_POR_SINAL
let sinalRecebido: Sinal | null = null
let filhoAtual: ChildProcess | null = null

// Ctrl+C ou kill no meio: repassa ao comando em andamento e deixa o finally derrubar o Postgres.
for (const sinal of Object.keys(SAIDA_POR_SINAL) as Sinal[]) {
  process.on(sinal, () => {
    sinalRecebido ??= sinal
    filhoAtual?.kill(sinal)
  })
}

/** Resolve com o código de saída; rejeita se o comando não abrir ou se veio um sinal. */
function executar(cmd: string, args: string[], opcoes: SpawnOptions = {}): Promise<number> {
  if (sinalRecebido) return Promise.reject(new Error(`interrompido (${sinalRecebido})`))
  return new Promise((ok, falha) => {
    const filho = spawn(cmd, args, { stdio: 'inherit', ...opcoes })
    filhoAtual = filho
    filho.once('error', e => { filhoAtual = null; falha(new Error(`${cmd}: ${e.message}`)) })
    filho.once('close', (status, sinal) => {
      filhoAtual = null
      if (sinalRecebido || sinal) falha(new Error(`interrompido (${sinalRecebido ?? sinal})`))
      else ok(status ?? 1)
    })
  })
}

async function rodar(cmd: string, args: string[], opcoes: SpawnOptions = {}) {
  const status = await executar(cmd, args, opcoes)
  if (status !== 0) throw new Error(`${cmd} ${args[0] ?? ''} saiu com ${status}`)
}

/** Porta que o sistema dá como livre agora; o pg_ctl é que confirma, ao ocupá-la. */
function portaLivre(): Promise<number> {
  return new Promise((ok, falha) => {
    const s = createServer()
    s.once('error', falha)
    s.listen(0, '127.0.0.1', () => {
      const endereco = s.address()
      s.close(() => (endereco && typeof endereco === 'object' ? ok(endereco.port) : falha(new Error('sem porta'))))
    })
  })
}

async function main() {
  const porta = await portaLivre()
  const dir = mkdtempSync(join(tmpdir(), 'mova-pg-teste-'))
  const url = `postgresql://postgres@localhost:${porta}/postgres`
  const parar = () => {
    spawnSync('pg_ctl', ['-D', dir, '-m', 'fast', 'stop'], { stdio: 'ignore' })
    rmSync(dir, { recursive: true, force: true })
  }
  let subiu = false
  let codigo = 1
  try {
    await rodar('initdb', ['-U', 'postgres', '-A', 'trust', dir], { stdio: 'ignore' })
    await rodar('pg_ctl', ['-D', dir, '-o', `-p ${porta} -k '${dir}'`, '-l', join(dir, 'log'), '-w', 'start'], { stdio: 'ignore' })
    subiu = true
    console.log(`Postgres descartável em localhost:${porta} (${dir})`)

    const psql = (arquivo: string, extra: string[] = []) =>
      rodar('psql', [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...extra, '-f', arquivo])
    await psql('supabase/ci-stubs.sql')
    await psql('supabase/schema-baseline.sql', ['-1'])
    const env = { ...process.env, CI: 'true', DATABASE_URL: url }
    await rodar('node', ['--import', 'tsx', 'scripts/migrate.ts', '--baseline-ate', '110'], { env })
    await rodar('node', ['--import', 'tsx', 'scripts/migrate.ts', '--aplicar'], { env })

    codigo = await executar('npm', ['run', 'test:db'], { env: { ...process.env, TEST_DATABASE_URL: url } })
  } catch (e) {
    console.error(e instanceof Error ? e.message : e)
    if (!subiu) {
      // O diretório é apagado em seguida: o fim do log vai para a tela agora.
      const log = join(dir, 'log')
      const fim = existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').slice(-5).join('\n') : ''
      console.error(`O Postgres não subiu; nada foi aplicado.${fim ? `\n${fim}` : ''}`)
    }
  } finally {
    if (manter && subiu) {
      console.log(`\nPostgres mantido de pé. Repetir só os testes:\n  TEST_DATABASE_URL=${url} npm run test:db`)
      console.log(`Derrubar e apagar:\n  pg_ctl -D '${dir}' -m fast stop && rm -rf '${dir}'`)
    } else {
      parar()
    }
  }
  process.exit(sinalRecebido ? SAIDA_POR_SINAL[sinalRecebido] : codigo)
}

main()
