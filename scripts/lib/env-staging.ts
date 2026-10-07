/**
 * Ambiente do `npm run dev:staging`. O Next, no dev, carrega .env.local e afins
 * e só preenche chave que ainda não existe no process.env (@next/env). Sem isto,
 * toda chave que o .env.staging.local não define viria do .env.local — que, em
 * máquina que ainda não trocou para o staging, é a produção: Open Finance,
 * Resend, Bling, CERT_MASTER_KEY.
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
