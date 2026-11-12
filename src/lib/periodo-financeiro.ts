import { ultimoDiaDoMes } from '@/lib/contas-pagar'

// Período do /financeiro ("de" e "até", dias do calendário). Antes a tela só
// filtrava por mês inteiro; agora abre no mês corrente, mas aceita qualquer recorte.

export type PeriodoFinanceiro = { de: string; ate: string }

/** "YYYY-MM-DD" que existe no calendário (recusa 30/02, mês 13 etc.). */
function diaValido(v: string | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const [, mes, dia] = v.split('-').map(Number)
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= ultimoDiaDoMes(v.slice(0, 7))
}

function mesInteiro(mes: string): PeriodoFinanceiro {
  return { de: `${mes}-01`, ate: `${mes}-${String(ultimoDiaDoMes(mes)).padStart(2, '0')}` }
}

/**
 * Lê `de`/`até` da URL. Sem eles, o mês corrente inteiro (o padrão de antes, então os
 * números de quem só abre a tela não mudam). `mes` é o parâmetro antigo, para link
 * salvo continuar abrindo o mesmo mês. "De" depois do "até" inverte: tela zerada
 * não diz o que deu errado.
 */
export function periodoFinanceiro(
  params: { de?: string; ate?: string; mes?: string },
  hoje: string,
): PeriodoFinanceiro {
  const mesBase = params.mes && /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes) ? params.mes : hoje.slice(0, 7)
  const padrao = mesInteiro(mesBase)
  const de = diaValido(params.de) ? params.de : padrao.de
  const ate = diaValido(params.ate) ? params.ate : padrao.ate
  return de <= ate ? { de, ate } : { de: ate, ate: de }
}

/**
 * Limites em UTC, de propósito: é a convenção que o /financeiro sempre usou (e o
 * relatório da fábrica e a Folha repetem), para os números baterem entre as telas.
 * `fimTs` é 00:00Z do dia seguinte ao "até".
 */
export function limitesDoPeriodo({ de, ate }: PeriodoFinanceiro): { inicioTs: Date; fimTs: Date } {
  const fimTs = new Date(`${ate}T00:00:00.000Z`)
  fimTs.setUTCDate(fimTs.getUTCDate() + 1)
  return { inicioTs: new Date(`${de}T00:00:00.000Z`), fimTs }
}
