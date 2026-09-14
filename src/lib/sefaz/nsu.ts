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

// Teto de iterações do laço de drenagem (sincronizar.ts): mesmo num backlog
// de 90 dias, isso tem que ter fim — sem teto, um lote sempre-tem-mais
// poderia rodar pra sempre e nunca devolver a função (e a Vercel mataria no
// meio, sem gravar nada de jeito nenhum).
export const TETO_ITERACOES_DRENAGEM = 40

// Orçamento de tempo do laço de drenagem, em ms: pára de drenar bem antes do
// `maxDuration` de 60s da rota do cron (route.ts), pra sobrar folga pro que
// vem depois de cada iteração (grava no banco) e pro aviso de WhatsApp no
// fim, quando a fila realmente zerar.
export const ORCAMENTO_DRENAGEM_MS = 45_000

// Lease renovado a cada iteração do dreno ENQUANTO a fila não zerou de
// verdade E o NSU está avançando (parada por teto ou por tempo — só faltou
// fôlego, não é NSU travado). Curto o bastante pra não travar o próximo
// `sincronizarGrupo` por muito tempo se este processo morrer no meio do
// dreno; longo o bastante pra cobrir o intervalo normal entre duas
// iterações do laço.
export const LEASE_DRENAGEM_MS = 2 * 60 * 1000

export type RetornoSefaz = { cStat: number; ultNSU: string; maxNSU: string }
export type EstadoSync = { ultNSU: string; maxNSU: string; proximaConsultaEm: Date | null }
export type EstadoAtual = { ultNSU: string; maxNSU: string }

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

/**
 * Normaliza o NSU que a SEFAZ devolveu, usando o que já está guardado como
 * fallback nos dois sentidos em que o valor bruto não presta:
 *
 * 1. "Não sei" (ausente, lixo, só espaço) — `nsuValido` devolve `null`.
 * 2. Retrocesso — numericamente MENOR que o guardado. Isso não devia
 *    acontecer num retorno são da SEFAZ, mas nada nesta função pode confiar
 *    cegamente na rede: um retorno estranho não pode fazer a leitura "voltar
 *    no tempo" e reabrir NSU que já foi processado.
 *
 * Nos dois casos o normalizado é o GUARDADO, nunca o bruto. Antes, essa
 * decisão vivia em `sincronizar.ts` como `proximo.ultNSU || estado?.ultNsu ||
 * '0'` — e `||` deixa passar `' '` (truthy em JS), que virava `'0'` no
 * envelope da próxima consulta e reabria a fila inteira. Foi exatamente essa
 * brecha que causou o cStat 656 de hoje. Devolver o valor já normalizado
 * daqui elimina a chance de o chamador repetir esse erro.
 */
function nsuNormalizado(bruto: string, guardado: string): string {
  const brutoNum = nsuValido(bruto)
  if (brutoNum === null) return guardado

  const guardadoNum = nsuValido(guardado)
  if (guardadoNum !== null && brutoNum < guardadoNum) return guardado

  return bruto.trim()
}

export function proximoEstado(retorno: RetornoSefaz, agora: Date, estadoAtual: EstadoAtual): EstadoSync {
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
    ultNSU: nsuNormalizado(retorno.ultNSU, estadoAtual.ultNSU),
    maxNSU: nsuNormalizado(retorno.maxNSU, estadoAtual.maxNSU),
    // Enquanto ultNSU < maxNSU ainda tem documento na fila: devolve nulo pra
    // quem chama poder emendar a próxima consulta na mesma execução, sem
    // esperar a hora — é o laço de drenagem de `sincronizarGrupo`
    // (sincronizar.ts) que faz essa emenda de verdade, consultando de novo
    // até a fila zerar ou bater no teto de iterações/tempo. Aqui só mora a
    // decisão pura de que emendar é permitido.
    proximaConsultaEm: aindaTemFila ? null : new Date(agora.getTime() + ESPERA_APOS_VAZIO_MS),
  }
}

export type MotivoParadaDrenagem = 'fila_zerou' | 'sem_progresso' | 'teto' | 'tempo' | null

/**
 * Decide se o laço de drenagem (`sincronizarGrupo`, sincronizar.ts) faz mais
 * uma iteração, ou para — e por quê. É a decisão CRITICAL que faltava: antes,
 * o laço só saía quando `proximaConsultaEm` (calculado acima, em cima do
 * `ultNSU`/`maxNSU` BRUTOS que a SEFAZ devolveu) virava não-nulo, por teto de
 * iterações ou por orçamento de tempo. Mas o `ultNSU` que `proximoEstado`
 * DEVOLVE é o normalizado (nunca retrocede — ver `nsuNormalizado`). Se a
 * SEFAZ devolver cStat 138 com `ultNSU` bruto menor ou igual ao guardado
 * (troca de certificado/CNPJ do grupo, cuja sequência de NSU é por CNPJ e
 * recomeça do zero; ou um NSU sujo gravado antes da correção anterior),
 * `aindaTemFila` fica `true` pro bruto, mas o normalizado devolvido é sempre
 * o mesmo valor — e o laço repetia a MESMA consulta até 40 vezes em 45
 * segundos. Isso é consumo indevido de verdade: foi o cStat 656 que
 * suspendeu o CNPJ.
 *
 * A guarda de progresso (`nsuAvancou`) é ortogonal ao cálculo de
 * `aindaTemFila` acima — não muda aquele cálculo, só corta o laço quando ele
 * mentir. Sem isso, um backlog legítimo de 90 dias (onde o NSU SEMPRE avança
 * a cada lote) continua drenando normalmente.
 */
export function deveContinuarDrenando(opts: {
  filaZerou: boolean
  nsuAvancou: boolean
  iteracao: number
  decorridoMs: number
}): { continuar: boolean; motivo: MotivoParadaDrenagem } {
  // Fila zerou é sempre a saída "boa" — checa antes da guarda de progresso
  // porque um cStat 137 (nenhum documento) pode legitimamente não mover o
  // NSU nenhum pouquinho: isso não é falta de progresso, é a fila em dia.
  if (opts.filaZerou) return { continuar: false, motivo: 'fila_zerou' }

  // Guarda de progresso: a fila "parece" ter documento (a SEFAZ não disse
  // cStat 137, nem ultNSU alcançou maxNSU), mas o NSU normalizado não moveu
  // em relação ao início desta iteração. Insistir só repete a mesma consulta
  // pra sempre. Pára ANTES do teto/orçamento — falta de progresso é sinal de
  // bug (CNPJ/certificado trocado, ou NSU sujo), não de backlog grande.
  if (!opts.nsuAvancou) return { continuar: false, motivo: 'sem_progresso' }

  if (opts.iteracao + 1 >= TETO_ITERACOES_DRENAGEM) return { continuar: false, motivo: 'teto' }

  if (opts.decorridoMs >= ORCAMENTO_DRENAGEM_MS) return { continuar: false, motivo: 'tempo' }

  return { continuar: true, motivo: null }
}

/**
 * Trava a gravar em `proxima_consulta_em` a cada iteração do laço de
 * drenagem, dado o motivo (`deveContinuarDrenando`, acima) pelo qual esta
 * iteração continua ou pára.
 *
 * Quando a fila zera de verdade, é sempre a trava de 1h que `proximoEstado`
 * já calculou (`proximaConsultaEmSeFilaZerou`) — comportamento inalterado.
 *
 * Quando a fila NÃO zera, dois casos são bem diferentes apesar de os dois
 * "pararem sem terminar":
 *
 * - `teto`/`tempo` (ou ainda vai continuar, motivo `null`): o NSU está
 *   avançando normalmente, só faltou iteração ou orçamento de tempo nesta
 *   execução. Lease curto (`LEASE_DRENAGEM_MS`), pra retomar rápido.
 * - `sem_progresso`: o NSU NÃO avançou. É exatamente a condição em que
 *   reconsultar a mesma faixa arrisca cStat 656 (consumo indevido) — foi
 *   assim que o CNPJ desta empresa foi suspenso. Um lease curto aqui
 *   convida qualquer disparo manual repetido (ou o próprio cron, se rodar de
 *   novo em poucos minutos) a bater na mesma faixa travada e reproduzir o
 *   incidente. Por isso `sem_progresso` usa a MESMA espera de 1h que a SEFAZ
 *   exige depois de um retorno vazio (`ESPERA_APOS_VAZIO_MS`) — não o lease
 *   curto pensado pra teto/tempo, onde insistir é seguro.
 */
export function proximaConsultaEmDrenagem(opts: {
  proximaConsultaEmSeFilaZerou: Date | null
  motivoParada: MotivoParadaDrenagem
  agora: Date
}): Date | null {
  if (opts.proximaConsultaEmSeFilaZerou !== null) return opts.proximaConsultaEmSeFilaZerou

  if (opts.motivoParada === 'sem_progresso') {
    return new Date(opts.agora.getTime() + ESPERA_APOS_VAZIO_MS)
  }

  return new Date(opts.agora.getTime() + LEASE_DRENAGEM_MS)
}
