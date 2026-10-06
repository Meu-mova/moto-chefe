/**
 * Descobre para qual projeto Supabase uma DATABASE_URL aponta, sem nunca
 * devolver a senha. Base da trava `--prod` do sql.ts e do migrate.ts.
 */

// Projeto "Estoque Chassi". O ref não é segredo: já vai ao navegador no
// NEXT_PUBLIC_SUPABASE_URL.
export const REF_PRODUCAO = 'bzlaradpofaecqzawyym'

export type AlvoBanco = {
  host: string
  ref: string | null
  ehProducao: boolean
}

export function descreverAlvo(databaseUrl: string): AlvoBanco {
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
  return {
    host: `${url.hostname}:${url.port || '5432'}`,
    ref,
    // Na dúvida, trata como produção: o custo de pedir --prod à toa é baixo.
    ehProducao: ref === null || ref === REF_PRODUCAO,
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
  const nome = alvo.ref === REF_PRODUCAO ? 'PRODUÇÃO' : alvo.ref ? `projeto ${alvo.ref}` : 'projeto desconhecido'
  return `Banco: ${alvo.host} (${nome})`
}

/**
 * Porta de entrada dos scripts: mostra o banco e encerra o processo se for a
 * produção sem --prod. stderr para não sujar saída que alguém redirecione.
 */
export function exigirAlvoPermitido(databaseUrl: string, temFlagProd: boolean): AlvoBanco {
  const alvo = descreverAlvo(databaseUrl)
  console.error(rotuloAlvo(alvo))
  const recusa = motivoRecusaProducao(alvo, temFlagProd)
  if (recusa) {
    console.error(recusa)
    process.exit(1)
  }
  return alvo
}
