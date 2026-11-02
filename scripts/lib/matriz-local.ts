// Matriz rota × papel contra a cópia local da produção (#594): saiu do CI e roda na máquina.
// Regras puras do scripts/e2e-acesso-rotas-local.ts: a trava do alvo e a escolha dos usuários.
import { USUARIOS_MATRIZ, type UsuarioMatriz } from './acesso-rotas'

const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])
// Portas do `supabase start` do prod-local: banco e API.
const PORTA_BANCO = '54322'
const PORTA_API = '54321'

function hostDe(url: string): URL | null {
  try {
    return new URL(url)
  } catch {
    return null
  }
}

/**
 * A matriz troca a senha de usuários reais: só pode ser na cópia. Recusa qualquer alvo que não
 * seja o Supabase local do prod-local. A mensagem leva só host e porta, nunca a URL (senha).
 */
export function motivoRecusaMatrizLocal(env: { databaseUrl?: string; supabaseUrl?: string; baseUrl?: string }): string | null {
  if (!env.databaseUrl) return 'falta DATABASE_URL (rode com o .env.localprod)'
  if (!env.supabaseUrl) return 'falta NEXT_PUBLIC_SUPABASE_URL (rode com o .env.localprod)'
  if (!env.baseUrl) return 'falta MOVA_URL (rode com o .env.localprod)'
  const banco = hostDe(env.databaseUrl)
  if (!banco || !LOOPBACK.has(banco.hostname) || banco.port !== PORTA_BANCO) {
    return `o banco não é a cópia local (${banco ? `${banco.hostname}:${banco.port || '5432'}` : 'URL inválida'})`
  }
  const api = hostDe(env.supabaseUrl)
  if (!api || !LOOPBACK.has(api.hostname) || api.port !== PORTA_API) {
    return `o Supabase não é o da cópia local (${api?.host ?? 'URL inválida'})`
  }
  const app = hostDe(env.baseUrl)
  if (!app || !LOOPBACK.has(app.hostname)) return `o app não está em localhost (${app?.host ?? 'URL inválida'})`
  return null
}

export type Candidato = {
  id: string
  email: string
  papel: string
  papeisExtras: string[]
  modulosExtras: string[]
  modulosBloqueados: string[]
  /** Tem linha em usuarios_dados; sem ela o layout manda para /completar-cadastro. */
  temDados: boolean
  temLoja: boolean
}

export const mascararEmail = (email: string) => {
  const [nome, dominio] = email.split('@')
  return `${nome.slice(0, 2)}***@${dominio}`
}

/**
 * Um usuário por papel da matriz, o primeiro da lista que serve (a consulta ordena pelo último
 * acesso). O esperado da matriz vem só do papel: quem tem papel extra ou módulo liberado ou
 * bloqueado fica de fora.
 */
export function escolherUsuarios(candidatos: Candidato[]): { escolhidos: (UsuarioMatriz & { id: string })[]; semCandidato: string[] } {
  const escolhidos: (UsuarioMatriz & { id: string })[] = []
  const semCandidato: string[] = []
  for (const { papel } of USUARIOS_MATRIZ) {
    const c = candidatos.find(x => x.papel === papel &&
      x.papeisExtras.length === 0 && x.modulosExtras.length === 0 && x.modulosBloqueados.length === 0 &&
      (papel === 'admin_geral' || (x.temDados && x.temLoja)))
    if (c) escolhidos.push({ id: c.id, email: c.email, papel, rotulo: mascararEmail(c.email) })
    else semCandidato.push(papel)
  }
  return { escolhidos, semCandidato }
}
