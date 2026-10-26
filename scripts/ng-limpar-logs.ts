/**
 * Varre os logs locais dos runners da Nota Gateway (ng-regressao-logs, ng-reenvio-logs) e
 * reescreve mascarado (0600) todo trecho de 8+ caracteres do token ou do empresaId do grupo.
 * Imprime só contagens, nunca valores.
 *
 * Uso (só staging): npx dotenv-cli -e .env.local -- node --import tsx scripts/ng-limpar-logs.ts
 */
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { criarRegistro, lerCredencialHomologacao, varrerArquivo } from './lib/postman-ng'

const GRUPO = 'Grupo Teste Sul'
const DIRS = ['ng-regressao-logs', 'ng-reenvio-logs'].map(d => join(homedir(), 'Development/work/moto-chefe', d))

async function main() {
  const registro = criarRegistro('')
  await lerCredencialHomologacao(GRUPO, registro)
  let total = 0
  for (const dir of DIRS) {
    if (!existsSync(dir)) { console.error(`${dir}: não existe`); continue }
    const arquivos = readdirSync(dir, { withFileTypes: true }).filter(a => a.isFile()).map(a => a.name)
    let mascarados = 0
    let trechos = 0
    for (const a of arquivos) {
      const n = varrerArquivo(join(dir, a), registro.segredos)
      if (n > 0) { mascarados++; trechos += n }
    }
    total += trechos
    console.error(`${dir}: ${arquivos.length} arquivo(s), ${mascarados} reescrito(s), ${trechos} trecho(s) mascarado(s)`)
  }
  console.error(`Total: ${total} trecho(s) mascarado(s)`)
}

main().catch((e: unknown) => {
  console.error('FALHOU:', e instanceof Error ? e.message : String(e))
  process.exitCode = 1
})
