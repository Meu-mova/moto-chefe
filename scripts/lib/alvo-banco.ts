/**
 * Descobre para qual projeto Supabase uma DATABASE_URL aponta, sem nunca
 * devolver a senha. Base da trava `--prod` do sql.ts e do migrate.ts.
 */

// Projeto "Estoque Chassi". O ref não é segredo: já vai ao navegador no
// NEXT_PUBLIC_SUPABASE_URL.
export const REF_PRODUCAO = 'bzlaradpofaecqzawyym'
// `mova-staging`. Usado como lista de permissão por quem apaga dado (seed).
export const REF_STAGING = 'pulsqeymzsheasxsdnnk'

export type AlvoBanco = {
  host: string
  ref: string | null
  ehProducao: boolean
  /** Postgres descartável do CI (service container do migracoes.yml). */
  ehLocalDoCi: boolean
}

const HOSTS_LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]'])

/**
 * `emCi`: só o migrate.ts liga, com o CI=true do GitHub Actions; os demais scripts
 * nunca aceitam loopback. Na máquina de alguém, um túnel para a produção também
 * responde em localhost: por isso fora do CI loopback é produção. No CI, recusa
 * ainda o usuário com ref (pooler); um túnel por conexão direta (usuário `postgres`,
 * sem ref) passaria — o limite é não ter CI=true fora do Actions.
 */
export function descreverAlvo(databaseUrl: string, emCi = false): AlvoBanco {
  let url: URL
  try {
    url = new URL(databaseUrl)
  } catch {
    // Sem repassar a mensagem original: ela traria a URL, senha incluída.
    throw new Error('DATABASE_URL não é uma URL válida')
  }
  // Pooler: usuário "postgres.<ref>". Conexão direta: host "db.<ref>.supabase.co".
  const refDoUsuario = decodeURIComponent(url.username).split('.')[1] ?? null
  const refDoHost = url.hostname.match(/^db\.([a-z0-9]+)\.supabase\.co$/)?.[1] ?? null
  const ref = refDoUsuario || refDoHost
  const ehLocalDoCi = emCi && HOSTS_LOOPBACK.has(url.hostname) && ref === null
  return {
    host: `${url.hostname}:${url.port || '5432'}`,
    ref,
    // Na dúvida, trata como produção: o custo de pedir --prod à toa é baixo.
    ehProducao: !ehLocalDoCi && (ref === null || ref === REF_PRODUCAO),
    ehLocalDoCi,
  }
}

/** Mensagem de recusa quando o alvo é a produção e falta --prod; null se pode seguir. */
export function motivoRecusaProducao(alvo: AlvoBanco, temFlagProd: boolean): string | null {
  if (!alvo.ehProducao || temFlagProd) return null
  return alvo.ref === null
    ? `Não consegui identificar o projeto de ${alvo.host}; tratando como produção. Repita com --prod se for isso mesmo.`
    : `${alvo.host} é a PRODUÇÃO (${alvo.ref}). Repita com --prod se for isso mesmo.`
}

export function rotuloAlvo(alvo: AlvoBanco): string {
  let nome = 'projeto desconhecido'
  if (alvo.ehLocalDoCi) nome = 'Postgres local do CI'
  else if (alvo.ref === REF_PRODUCAO) nome = 'PRODUÇÃO'
  else if (alvo.ref) nome = `projeto ${alvo.ref}`
  return `Banco: ${alvo.host} (${nome})`
}

/**
 * Porta de entrada dos scripts: mostra o banco e encerra o processo se for a
 * produção sem --prod. stderr para não sujar saída que alguém redirecione.
 */
export function exigirAlvoPermitido(databaseUrl: string, temFlagProd: boolean, emCi = false): AlvoBanco {
  const alvo = descreverAlvo(databaseUrl, emCi)
  console.error(rotuloAlvo(alvo))
  const recusa = motivoRecusaProducao(alvo, temFlagProd)
  if (recusa) {
    console.error(recusa)
    process.exit(1)
  }
  return alvo
}

/**
 * Para quem apaga ou usa dado como se fosse de teste (seed, dev:staging): banco
 * E Supabase precisam ser o mova-staging. Uma ponta só no staging não basta — a
 * URL do Supabase da prod com o banco do staging apagaria usuário real do Auth.
 */
export function motivoRecusaForaDoStaging(databaseUrl: string | undefined, supabaseUrl: string | undefined): string | null {
  const refBanco = databaseUrl ? descreverAlvo(databaseUrl).ref : null
  let refSupabase: string | null = null
  try {
    refSupabase = supabaseUrl ? new URL(supabaseUrl).hostname.split('.')[0] : null
  } catch {
    refSupabase = null
  }
  if (refBanco === REF_STAGING && refSupabase === REF_STAGING) return null
  return `Só roda no mova-staging (${REF_STAGING}). Banco: ${refBanco ?? '?'}, Supabase: ${refSupabase ?? '?'}.`
}
