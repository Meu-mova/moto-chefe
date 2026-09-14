// Quando o MOVA pode falar com a Distribuição DF-e, e de onde continua a leitura.
//
// A consulta é sequencial por NSU: manda-se o último NSU conhecido e a SEFAZ
// devolve o lote seguinte, mais o ultNSU (onde a leitura parou) e o maxNSU (o
// fim da fila). Enquanto ultNSU < maxNSU tem documento esperando.
//
// A regra que manda aqui não é de eficiência, é de bloqueio: depois de um
// retorno vazio, consultar antes de uma hora devolve cStat 656 (consumo
// indevido) e a SEFAZ suspende o CNPJ. Por isso a decisão vive neste módulo
// puro, com teste — e não espalhada pelo código que faz a chamada.

export const ESPERA_APOS_VAZIO_MS = 60 * 60 * 1000

export const CSTAT_DOCUMENTO_LOCALIZADO = 138
export const CSTAT_NENHUM_DOCUMENTO = 137
export const CSTAT_CONSUMO_INDEVIDO = 656

export type RetornoSefaz = { cStat: number; ultNSU: string; maxNSU: string }
export type EstadoSync = { ultNSU: string; maxNSU: string; proximaConsultaEm: Date | null }

/** `proximaConsultaEm` nulo = nunca consultou, ou ainda tem fila. */
export function podeConsultar(estado: { proximaConsultaEm: Date | null }, agora: Date): boolean {
  if (!estado.proximaConsultaEm) return true
  return agora.getTime() >= estado.proximaConsultaEm.getTime()
}

/**
 * Comparar como número (em vez de string) é o que protege contra NSU sem
 * zero-padding ou lixo do parser — se algum dia o NSU chegar sem os zeros à
 * esquerda, "9" > "10" como string mas 9 < 10 como número. Devolve `null`
 * quando o valor está ausente ou não é numérico, para o chamador poder
 * distinguir "não sei" de "zero" e nunca tratar um como o outro.
 */
function nsuValido(nsu: string): number | null {
  const semEspacos = nsu.trim()
  if (!semEspacos) return null
  // Number(' ') é 0 em JavaScript — sem o trim acima, um NSU só de espaço
  // passaria como "válido" e reabriria o mesmo buraco do NSU vazio/lixo.
  const valor = Number(semEspacos)
  return Number.isFinite(valor) ? valor : null
}

export function proximoEstado(retorno: RetornoSefaz, agora: Date): EstadoSync {
  const ultNSU = nsuValido(retorno.ultNSU)
  const maxNSU = nsuValido(retorno.maxNSU)

  // Falha fechado: se ultNSU ou maxNSU vier ausente/não numérico (tag
  // faltando, namespace mudou no parser), NÃO dá pra afirmar que ainda tem
  // fila. Tratar ausência como zero liberaria consulta imediata por engano
  // — exatamente o caminho que arrisca bloqueio do CNPJ. Sem certeza,
  // espera a 1 hora, como se fosse retorno vazio.
  const aindaTemFila =
    retorno.cStat === CSTAT_DOCUMENTO_LOCALIZADO &&
    ultNSU !== null &&
    maxNSU !== null &&
    ultNSU < maxNSU

  return {
    ultNSU: retorno.ultNSU,
    maxNSU: retorno.maxNSU,
    proximaConsultaEm: aindaTemFila ? null : new Date(agora.getTime() + ESPERA_APOS_VAZIO_MS),
  }
}
