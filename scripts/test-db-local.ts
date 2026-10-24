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
import { spawnSync, type SpawnSyncOptions } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const manter = process.argv.includes('--manter')

function rodar(cmd: string, args: string[], opcoes: SpawnSyncOptions = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opcoes })
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`)
  if (r.status !== 0) throw new Error(`${cmd} ${args[0] ?? ''} saiu com ${r.status}`)
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
    rodar('initdb', ['-U', 'postgres', '-A', 'trust', dir], { stdio: 'ignore' })
    rodar('pg_ctl', ['-D', dir, '-o', `-p ${porta} -k ${dir}`, '-l', join(dir, 'log'), '-w', 'start'], { stdio: 'ignore' })
    subiu = true
    console.log(`Postgres descartável em localhost:${porta} (${dir})`)

    const psql = (arquivo: string, extra: string[] = []) =>
      rodar('psql', [url, '-X', '-q', '-v', 'ON_ERROR_STOP=1', ...extra, '-f', arquivo])
    psql('supabase/ci-stubs.sql')
    psql('supabase/schema-baseline.sql', ['-1'])
    const env = { ...process.env, CI: 'true', DATABASE_URL: url }
    rodar('node', ['--import', 'tsx', 'scripts/migrate.ts', '--baseline-ate', '110'], { env })
    rodar('node', ['--import', 'tsx', 'scripts/migrate.ts', '--aplicar'], { env })

    const teste = spawnSync('npm', ['run', 'test:db'], { stdio: 'inherit', env: { ...process.env, TEST_DATABASE_URL: url } })
    codigo = teste.status ?? 1
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
      console.log(`Derrubar e apagar:\n  pg_ctl -D ${dir} -m fast stop && rm -rf ${dir}`)
    } else {
      parar()
    }
  }
  process.exit(codigo)
}

main()
