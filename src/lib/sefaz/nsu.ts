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

/** NSU vem zero-padded em 15 dígitos; comparar como número evita "9" > "10". */
const n = (nsu: string) => Number(nsu || 0)

export function proximoEstado(retorno: RetornoSefaz, agora: Date): EstadoSync {
  const aindaTemFila =
    retorno.cStat === CSTAT_DOCUMENTO_LOCALIZADO && n(retorno.ultNSU) < n(retorno.maxNSU)

  return {
    ultNSU: retorno.ultNSU,
    maxNSU: retorno.maxNSU,
    proximaConsultaEm: aindaTemFila ? null : new Date(agora.getTime() + ESPERA_APOS_VAZIO_MS),
  }
}
