import { sql } from 'drizzle-orm'

/**
 * Versão da cobrança do contrato assinado da adesão `a` (adesoes_mova), ou null sem contrato
 * assinado. Trecho único para o 1º acesso e o cron; quem decide o regime é `ehRegimeNovo`.
 */
export const versaoAssinadaDaAdesao = sql`(
  select max(c.versao_cobranca) from contratos_adesao c where c.adesao_id = a.id and c.status = 'assinado'
)`
