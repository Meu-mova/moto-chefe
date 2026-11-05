// Regras da inutilização de número da NF de saída (#504), pelas respostas do suporte da Nota Gateway.
import { ehDenegada, ehDuplicidade, ehRecusada, MINUTOS_PARA_DESCARTAR, numeroLivre } from './status'
import { semZerosAEsquerda } from '@/lib/texto'
import { ambienteDaNg, divergenciaDeAmbiente } from './ambiente'

/** Irreversível na produção: sócios, admin_geral e admin_rede (decisões do Luis, #504 e #597). Tela e servidor leem daqui. */
const PAPEIS_QUE_PEDEM = ['admin_geral', 'admin_socio', 'admin_rede'] as const

export function podePedirInutilizacao(papel: string): boolean {
  return (PAPEIS_QUE_PEDEM as readonly string[]).includes(papel)
}

export const JUSTIFICATIVA_MIN = 15
export const JUSTIFICATIVA_MAX = 255

export type ValidacaoJustificativa = { ok: true; justificativa: string } | { ok: false; erro: string }

/** O texto como vai à NG: sem acento e sem espaço repetido. O contador do diálogo mede este (C3). */
export function normalizarJustificativa(bruta: string): string {
  return bruta.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

// A NG só aceita ASCII básico: o acento sai, e o que sobrar fora disso (emoji, travessão) recusa.
export function validarJustificativa(bruta: string): ValidacaoJustificativa {
  const justificativa = normalizarJustificativa(bruta)
  if (/[^\x20-\x7e]/.test(justificativa)) return { ok: false, erro: 'A justificativa só aceita letras, números e pontuação simples.' }
  if (justificativa.length < JUSTIFICATIVA_MIN) return { ok: false, erro: `A justificativa precisa de pelo menos ${JUSTIFICATIVA_MIN} caracteres.` }
  if (justificativa.length > JUSTIFICATIVA_MAX) return { ok: false, erro: `A justificativa pode ter no máximo ${JUSTIFICATIVA_MAX} caracteres.` }
  return { ok: true, justificativa }
}

export const MAX_NUMEROS_POR_INUTILIZACAO = 10_000 // MOC NF-e, regra I04
const NUMERO_MAXIMO = 999_999_999

export type FaixaInutilizacao = { serie: string; numeroInicial: number; numeroFinal: number; justificativa: string }
export type ValidacaoFaixa = { ok: true; faixa: FaixaInutilizacao } | { ok: false; erro: string }

/** Uma faixa contínua por pedido: nunca se divide sozinha. A série vem da NG, não da tela. */
export function validarFaixaInutilizacao(entrada: { serie: string; numeroInicial: string; numeroFinal: string; justificativa: string }): ValidacaoFaixa {
  const serie = entrada.serie.trim()
  if (!/^\d{1,3}$/.test(serie) || Number(serie) < 1) return { ok: false, erro: 'A série de NF-e configurada na Nota Gateway precisa ser um número de 1 a 999.' }
  const inteiro = (texto: string) => (/^\d+$/.test(texto.trim()) ? Number(texto) : NaN)
  const [numeroInicial, numeroFinal] = [inteiro(entrada.numeroInicial), inteiro(entrada.numeroFinal)]
  if (!(numeroInicial >= 1 && numeroFinal >= numeroInicial && numeroFinal <= NUMERO_MAXIMO)) {
    return { ok: false, erro: 'Informe uma faixa crescente de números inteiros, do 1 em diante.' }
  }
  if (numeroFinal - numeroInicial + 1 > MAX_NUMEROS_POR_INUTILIZACAO) {
    return { ok: false, erro: `Cada pedido pode ter no máximo ${MAX_NUMEROS_POR_INUTILIZACAO.toLocaleString('pt-BR')} números.` }
  }
  const justificativa = validarJustificativa(entrada.justificativa)
  return justificativa.ok ? { ok: true, faixa: { serie, numeroInicial, numeroFinal, justificativa: justificativa.justificativa } } : justificativa
}

// Ajuste SINIEF 40/2026 (§ 6º novo na cláusula décima quarta do 07/05): o pedido não se aplica a AC, BA e SP (vale desde 01/11/2026).
const UFS_SEM_INUTILIZACAO = ['AC', 'BA', 'SP']
export const ufPermiteInutilizacao = (uf: string): boolean => !UFS_SEM_INUTILIZACAO.includes(uf.trim().toUpperCase())

/** Série do ambiente da credencial e UF do emitente, na resposta de Consultar Empresa; null se faltar algum. */
export function serieEUfDaEmpresa(empresa: unknown, ambiente: 'Producao' | 'Homologacao'): { serie: string; uf: string } | null {
  const e = empresa as { endereco?: { uf?: unknown }; emissaoNFeProduto?: Record<string, { serieNFe?: unknown } | undefined> } | null
  const serie = e?.emissaoNFeProduto?.[ambiente === 'Producao' ? 'ambienteProducao' : 'ambienteHomologacao']?.serieNFe
  const uf = e?.endereco?.uf
  return typeof serie === 'string' && serie.trim() && typeof uf === 'string' && uf.trim() ? { serie: serie.trim(), uf: uf.trim().toUpperCase() } : null
}

export type SituacaoInutilizacao = 'pendente' | 'autorizada' | 'negada'

/** Nossos: o pedido não chegou à NG. Contam como negada para liberar o número a outro pedido. */
export const STATUS_NAO_ENVIADA = 'NaoEnviada'
export const STATUS_SEM_CONFIGURACAO = 'SemConfiguracao'

// O suporte falou em InutilizacaoAutorizada/Negada, mas a consulta da homologação devolveu
// Autorizada/Negada (29/10/2026, #507): os dois nomes valem.
export function situacaoInutilizacao(status: string): SituacaoInutilizacao {
  if (status === 'Autorizada' || status === 'InutilizacaoAutorizada') return 'autorizada'
  if (status === 'Negada' || status === 'InutilizacaoNegada' || status === STATUS_NAO_ENVIADA || status === STATUS_SEM_CONFIGURACAO) return 'negada'
  return 'pendente'
}

/**
 * A NG não conhece o id (5xx ou rede no envio, sem pedido criado): depois do mesmo
 * prazo do descarte da NF, o pedido vira não enviado e o número fica livre. Antes
 * disso, ainda pode ser só o atraso da NG.
 */
export function pedidoSemRespostaVenceu(criadoEm: Date, agora: Date): boolean {
  return agora.getTime() - criadoEm.getTime() >= MINUTOS_PARA_DESCARTAR * 60_000
}

export type NotaParaInutilizar = {
  status: string
  motivoStatus: string | null
  numero: string | null
  serie: string | null
  vendaId: string | null
}

export type Elegibilidade = { ok: true; serie: string; numero: number } | { ok: false; erro: string }

/**
 * Só a recusada pela SEFAZ gasta número sem nota: a Descartada nunca chegou à NG
 * (o número vem da resposta dela). A denegada também chega como "Negada" e já
 * usou o número, como a 539. Recusada de venda ativa ainda vai ser reenviada com
 * o mesmo número, salvo se a venda já tem outra nota viva com número diferente.
 */
export function elegivelParaInutilizar(nota: NotaParaInutilizar, outraNotaVivaDaVenda: { numero: string | null } | null): Elegibilidade {
  if (!ehRecusada(nota.status)) return { ok: false, erro: 'Só se inutiliza o número de nota rejeitada pela SEFAZ.' }
  const numero = Number(nota.numero)
  if (!nota.serie?.trim() || !Number.isInteger(numero) || numero < 1) {
    return { ok: false, erro: 'Esta nota não tem número gravado: não há o que inutilizar.' }
  }
  if (ehDenegada(nota) || ehDuplicidade(nota)) return { ok: false, erro: 'O número desta nota já foi usado na SEFAZ e não pode ser inutilizado.' }
  // "0974" e "974" são o mesmo número; a série vai sem zeros à esquerda, como a SEFAZ compara.
  const substituida = !!outraNotaVivaDaVenda && semZerosAEsquerda(outraNotaVivaDaVenda.numero) !== semZerosAEsquerda(nota.numero)
  if (nota.vendaId && !substituida) return { ok: false, erro: 'A venda desta nota continua ativa: corrija e reenvie a nota em vez de inutilizar o número.' }
  return { ok: true, serie: semZerosAEsquerda(nota.serie), numero }
}

export type NotaDoNumero = { id: string; numero: string | null; serie: string | null; status: string; motivoStatus: string | null }

export type PedidoDoNumero = { situacao: SituacaoInutilizacao; motivoStatus: string | null; serie: string; numeroInicial: number; numeroFinal: number; criadoEm: Date | string }

/**
 * Tudo o que a decisão precisa, carregado uma vez (inutilizar.ts) para o pedido e para a
 * lista: a regra mora aqui, e o SQL só traz candidatos do mesmo grupo e ambiente.
 */
export type ContextoInutilizacao = {
  nota: NotaParaInutilizar & { id: string; ambiente: string }
  /** Outra nota viva da mesma venda (reenvio que saiu com número novo). */
  outraNotaVivaDaVenda: { numero: string | null } | null
  /** Notas com o mesmo número, em qualquer série; a própria pode vir junto. */
  outrasNotas: NotaDoNumero[]
  /** Pedidos de inutilização do mesmo número, de qualquer nota e série. */
  pedidos: PedidoDoNumero[]
  /** Ambiente da credencial da NG do grupo (notagateway_config, sem decifrar); null = sem credencial. */
  ambienteDoGrupo: string | null
}

/** Contexto de nota que não vai ao loader: a elegibilidade (status) decide antes de olhar o resto. */
export function contextoVazio(nota: ContextoInutilizacao['nota']): ContextoInutilizacao {
  return { nota, outraNotaVivaDaVenda: null, outrasNotas: [], pedidos: [], ambienteDoGrupo: null }
}

export const ERRO_JA_PEDIDA = 'Este número já tem um pedido de inutilização.'
export const ERRO_SEM_CONFIGURACAO = 'Nota Gateway não configurada para esta empresa.'
/** A ação que a orientação de ambiente cita (divergenciaDeAmbiente). */
export const ACAO_INUTILIZAR = 'inutilizar o número'

/**
 * `nenhuma`: nota não elegível, sem botão nem texto. Os demais tipos sem botão levam em
 * `erro` a frase que a linha mostra e que o servidor devolve (a mesma).
 */
export type DecisaoInutilizacao =
  | { tipo: 'pode'; serie: string; numero: number; ultimaNegada: string | null }
  | { tipo: 'pendente' | 'autorizada' | 'numero_usado' | 'nenhuma' | 'sem_configuracao' | 'ambiente_divergente'; erro: string }

type SerieENumero = { serie: string | null; numero: string | number | null }

function mesmaSerieENumero(a: SerieENumero, b: SerieENumero): boolean {
  return semZerosAEsquerda(a.numero?.toString()) === semZerosAEsquerda(b.numero?.toString())
    && semZerosAEsquerda(a.serie) === semZerosAEsquerda(b.serie)
}

const maisRecentePrimeiro = (a: PedidoDoNumero, b: PedidoDoNumero) => new Date(b.criadoEm).getTime() - new Date(a.criadoEm).getTime()

/**
 * O que a linha mostra e o que o servidor aceita, pela mesma regra (#597): a nota tem de
 * ser elegível; um pedido não negado do número, desta ou de outra nota, esconde o botão
 * (C5); o grupo tem de estar no ambiente da nota (a credencial vai ao ambiente dela);
 * outra nota que ocupa o número (numeroLivre) também esconde (C4); a última negada aparece
 * com o motivo e deixa pedir de novo.
 */
export function decidirInutilizacao(ctx: ContextoInutilizacao): DecisaoInutilizacao {
  const elegivel = elegivelParaInutilizar(ctx.nota, ctx.outraNotaVivaDaVenda)
  if (!elegivel.ok) return { tipo: 'nenhuma', erro: elegivel.erro }
  // Pedido em faixa cobre o número se ele cai entre o inicial e o final (o individual tem os dois iguais).
  const pedidos = ctx.pedidos.filter(p => semZerosAEsquerda(p.serie) === semZerosAEsquerda(elegivel.serie)
    && elegivel.numero >= p.numeroInicial && elegivel.numero <= p.numeroFinal)
  const vivo = pedidos.find(p => p.situacao !== 'negada')
  if (vivo?.situacao === 'autorizada') return { tipo: 'autorizada', erro: 'Este número já foi inutilizado.' }
  if (vivo) return { tipo: 'pendente', erro: ERRO_JA_PEDIDA }
  if (ctx.ambienteDoGrupo === null) return { tipo: 'sem_configuracao', erro: ERRO_SEM_CONFIGURACAO }
  const divergencia = divergenciaDeAmbiente(ctx.nota.ambiente, ambienteDaNg(ctx.ambienteDoGrupo), ACAO_INUTILIZAR)
  if (divergencia) return { tipo: 'ambiente_divergente', erro: divergencia }
  const ocupado = ctx.outrasNotas.some(o => o.id !== ctx.nota.id && mesmaSerieENumero(o, elegivel) && !numeroLivre(o))
  if (ocupado) return { tipo: 'numero_usado', erro: `O número ${elegivel.numero} está em outra nota deste grupo (autorizada, cancelada, denegada ou em andamento). Não há o que inutilizar.` }
  const ultima = [...pedidos].sort(maisRecentePrimeiro)[0]
  return { tipo: 'pode', serie: elegivel.serie, numero: elegivel.numero, ultimaNegada: ultima ? ultima.motivoStatus?.trim() || 'sem motivo informado' : null }
}
