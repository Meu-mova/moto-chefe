/**
 * Cifra as senhas do portal da fábrica que ainda estão em texto puro em
 * `lojas.fabrica_senha` (#292). Não é migração SQL porque a chave
 * (CERT_MASTER_KEY) só existe no ambiente do app.
 *
 * Uso:
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/cifrar-senhas-fabrica.ts --status
 *   npx dotenv-cli -e .env.local -- node --import tsx scripts/cifrar-senhas-fabrica.ts --aplicar
 *   npx dotenv-cli -e .env.prod.local -- node --import tsx scripts/cifrar-senhas-fabrica.ts --aplicar --prod
 *
 * Imprime o banco antes de tudo e recusa a produção sem --prod. Nunca imprime
 * senha: só o nome das lojas e as contagens. Rodar de novo não faz nada.
 */
import postgres from 'postgres'
import { exigirAlvoPermitido } from './lib/alvo-banco'
import { cifrarSenhaFabrica, lerSenhaFabrica, senhaFabricaCifrada } from '../src/lib/fabrica-senha'

const args = process.argv.slice(2)
const temProd = args.includes('--prod')
const aplicar = args.includes('--aplicar')
if (!aplicar && !args.includes('--status')) {
  console.error('Uso: scripts/cifrar-senhas-fabrica.ts --status | --aplicar  [--prod]')
  process.exit(1)
}
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL não definida — rode via `npx dotenv-cli -e <arquivo .env> -- ...`')
  process.exit(1)
}

exigirAlvoPermitido(process.env.DATABASE_URL, temProd)
const sql = postgres(process.env.DATABASE_URL, { max: 1, prepare: false, connect_timeout: 15 })

async function main() {
  const linhas = await sql<{ id: string; nome: string; senha: string }[]>`
    select id, nome, fabrica_senha as senha from lojas where fabrica_senha is not null order by nome`
  const puras = linhas.filter(l => !senhaFabricaCifrada(l.senha))
  console.log(`${linhas.length} loja(s) com senha do portal; ${puras.length} em texto puro.`)
  for (const l of puras) console.log(`  - ${l.nome}`)
  if (!aplicar || !puras.length) return

  for (const l of puras) {
    const pacote = cifrarSenhaFabrica(l.senha)
    // Confere antes de gravar: pacote que não volta à mesma senha não substitui a original.
    if (lerSenhaFabrica(pacote) !== l.senha) throw new Error(`Conferência falhou em ${l.nome}; nada gravado nesta loja`)
    // O where com a senha antiga não pisa numa senha trocada na tela enquanto o script roda.
    const r = await sql`update lojas set fabrica_senha = ${pacote} where id = ${l.id} and fabrica_senha = ${l.senha}`
    console.log(`  ✓ ${l.nome}${r.count ? '' : ' (mudou durante o script; ficou como está)'}`)
  }
}

main()
  .then(() => sql.end())
  .catch(async (e: unknown) => {
    console.error('FALHOU:', e instanceof Error ? e.message : String(e))
    await sql.end()
    process.exit(1)
  })
