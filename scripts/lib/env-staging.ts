/**
 * Ambiente do `npm run dev:staging`. O Next, no dev, carrega além do .env.local
 * o .env, o .env.development e afins, e só preenche chave que ainda não existe no
 * process.env (@next/env). Sem isto, chave que o .env.local não define viria de
 * um desses arquivos — um esquecido com valor da produção (Open Finance, Resend,
 * Bling, CERT_MASTER_KEY) entraria no app de staging.
 */

export type EnvStaging = { env: Record<string, string | undefined>; anuladas: string[] }

/**
 * Valores do staging por cima do ambiente atual; chave que só existe nos outros
 * arquivos vira string vazia, que o Next não sobrescreve. O app trata vazio como
 * "não configurado" nas checagens com `!` ou `if (!x)`; usos com `??` (bling.ts,
 * kommo.ts) leem "" como valor, mas só em integrações desligadas no staging.
 */
export function montarEnvStaging(
  ambienteAtual: Record<string, string | undefined>,
  staging: Record<string, string>,
  chavesDosOutrosArquivos: string[],
): EnvStaging {
  const anuladas = [...new Set(chavesDosOutrosArquivos)]
    .filter(k => !(k in staging))
    .sort()
  const env: Record<string, string | undefined> = { ...ambienteAtual, ...staging }
  for (const k of anuladas) env[k] = ''
  return { env, anuladas }
}
