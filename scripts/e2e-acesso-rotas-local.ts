/**
 * Matriz rota × papel contra a cópia local da produção (#594). Saiu do CI: roda na máquina,
 * antes da release, quando algum PR mexeu em rota, permissão ou navegação.
 *
 * Para cada papel da matriz, pega um usuário real da cópia (o de acesso mais recente, sem papel
 * extra nem módulo liberado ou bloqueado), troca a senha dele SÓ NA CÓPIA por uma aleatória e roda
 * o scripts/e2e-acesso-rotas.ts. A saída mostra o e-mail mascarado. O próximo copiar-prod.py
 * desfaz as senhas.
 *
 * Antes: cópia de pé (`supabase start` e `copiar-prod.py` no prod-local) e o app servindo a cópia
 * em localhost:3600, com o .env.local renomeado (senão o Next completa com o staging):
 *   npx dotenv-cli -e .env.localprod -- npx next dev -p 3600
 * Depois, noutro terminal:
 *   npm run e2e:acesso:local
 */
import { randomBytes } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import postgres from 'postgres'
import { escolherUsuarios, motivoRecusaMatrizLocal, type Candidato } from './lib/matriz-local'
import { USUARIOS_MATRIZ } from './lib/acesso-rotas'

const databaseUrl = process.env.DATABASE_URL
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, '')
const baseUrl = (process.env.MOVA_URL ?? 'http://localhost:3600').replace(/\/$/, '')
const chave = process.env.SUPABASE_SERVICE_ROLE_KEY

const recusa = motivoRecusaMatrizLocal({ databaseUrl, supabaseUrl, baseUrl })
if (recusa || !chave) {
  console.error(`Recusado: ${recusa ?? 'falta SUPABASE_SERVICE_ROLE_KEY (rode com o .env.localprod)'}`)
  process.exit(1)
}

async function main() {
  const app = await fetch(`${baseUrl}/login`).catch(() => null)
  if (!app?.ok) throw new Error(`o app não respondeu em ${baseUrl}/login: suba o next dev com o .env.localprod`)

  const sql = postgres(databaseUrl!, { max: 1, prepare: false, connect_timeout: 15 })
  let candidatos: Candidato[]
  try {
    candidatos = await sql<Candidato[]>`
      select u.id, u.email, u.papel::text as papel,
        u.papeis_extras as "papeisExtras", u.modulos_extras as "modulosExtras",
        u.modulos_bloqueados as "modulosBloqueados",
        exists (select 1 from usuarios_dados d where d.usuario_id = u.id) as "temDados",
        u.loja_id is not null as "temLoja"
      from usuarios u
      join auth.users a on a.id = u.id
      where u.ativo and u.papel::text in ${sql(USUARIOS_MATRIZ.map(u => u.papel))}
      order by a.last_sign_in_at desc nulls last`
  } finally {
    await sql.end()
  }

  const { escolhidos, semCandidato } = escolherUsuarios(candidatos)
  if (semCandidato.length) console.log(`Sem usuário que sirva na cópia, ficam de fora: ${semCandidato.join(', ')}`)
  if (escolhidos.length === 0) throw new Error('nenhum papel da matriz tem usuário na cópia')

  const senha = randomBytes(18).toString('base64url')
  for (const u of escolhidos) {
    const r = await fetch(`${supabaseUrl}/auth/v1/admin/users/${u.id}`, {
      method: 'PUT',
      headers: { apikey: chave!, Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: senha }),
    })
    if (!r.ok) throw new Error(`não troquei a senha de ${u.rotulo} na cópia: HTTP ${r.status}`)
  }

  // Sem o bypass da Vercel: com ele, a matriz recusa host que não seja preview.
  const { VERCEL_AUTOMATION_BYPASS_SECRET: _bypass, ...semBypass } = process.env
  const env = { ...semBypass, NAVEGACAO_URL: baseUrl, SMOKE_SENHA: senha, MATRIZ_USUARIOS: JSON.stringify(escolhidos) }
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/e2e-acesso-rotas.ts'], { stdio: 'inherit', env })
  process.exit(r.status ?? 1)
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1) })
