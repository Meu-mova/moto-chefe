import { hojeBrt } from '@/lib/data-venda'

// Regras da mensalidade do MOVA (contrato de adesão, cláusula 4; spec
// 2026-09-14-assinatura-mova-design.md). Datas são 'AAAA-MM-DD' no fuso de Brasília.

export const DIAS_PRIMEIRO_VENCIMENTO = 30
export const DIAS_ANTECEDENCIA_COBRANCA = 10
export const DIAS_ATE_BLOQUEIO = 5
export const MULTA_ATRASO = 0.02
export const JUROS_AO_MES = 0.01

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86400_000)
}

/**
 * Vencimento da n-ésima mensalidade (0 = a primeira). A 1ª vence 30 dias após o
 * 1º acesso; as seguintes, no mesmo dia dos meses seguintes, e no dia 28 quando
 * esse dia for 29, 30 ou 31 (contrato 4.1).
 */
export function vencimento(primeiroAcesso: Date, n: number): string {
  const primeiro = somarDias(hojeBrt(primeiroAcesso), DIAS_PRIMEIRO_VENCIMENTO)
  if (n === 0) return primeiro
  const [ano, mes, dia] = primeiro.split('-').map(Number)
  const d = new Date(Date.UTC(ano, mes - 1 + n, Math.min(dia, 28)))
  return d.toISOString().slice(0, 10)
}

export function competencia(venc: string): string {
  return venc.slice(0, 7)
}

export type CobrancaDevida = { n: number; vencimento: string; competencia: string }

/**
 * Cobranças que já deviam existir em `hoje`: todas cujo vencimento está a 10 dias
 * ou menos. Devolve também as atrasadas, para um cron que ficou parado criar o que
 * faltou; a unicidade (grupo, competência) no banco descarta as que já existem.
 */
export function cobrancasDevidas(primeiroAcesso: Date, hoje: string): CobrancaDevida[] {
  const limite = somarDias(hoje, DIAS_ANTECEDENCIA_COBRANCA)
  const devidas: CobrancaDevida[] = []
  for (let n = 0; ; n++) {
    const v = vencimento(primeiroAcesso, n)
    if (v > limite) return devidas
    devidas.push({ n, vencimento: v, competencia: competencia(v) })
  }
}

/** A taxa de implantação vai junto da 1ª mensalidade (contrato de adesão). */
export function valorBase(n: number, valorMensal: number, taxaImplantacao: number): number {
  return n === 0 ? valorMensal + taxaImplantacao : valorMensal
}

/** Multa de 2% e juros de 1% ao mês, pro rata dia, a partir do dia seguinte ao vencimento (contrato 4.4). */
export function acrescimoAtraso(valor: number, venc: string, hoje: string): number {
  const dias = diasEntre(venc, hoje)
  if (dias <= 0) return 0
  const juros = valor * JUROS_AO_MES * (dias / 30)
  return Math.round((valor * MULTA_ATRASO + juros) * 100) / 100
}

/** Data a partir da qual o grupo fica bloqueado sem pagamento (contrato 4.5). */
export function bloqueiaEm(venc: string): string {
  return somarDias(venc, DIAS_ATE_BLOQUEIO + 1)
}

/** Mensalidade do ciclo mensal ou a cobrança única da adesão no 1º acesso (#802). */
export type TipoCobranca = 'mensalidade' | 'adesao'

/**
 * Grupo bloqueado: a adesão em aberto bloqueia na hora, porque libera o sistema (contrato 3.4,
 * versão 2); a mensalidade, só depois da data de bloqueio.
 */
export function estaBloqueado(abertas: { tipo: TipoCobranca; vencimento: string }[], hoje: string): boolean {
  return abertas.some(c => c.tipo === 'adesao' || hoje >= bloqueiaEm(c.vencimento))
}

/** Quem vê valor e link e paga (decisão de 17/10/2026, Q5 da #166). Os demais só veem o aviso. */
export function podePagarMensalidade(papel: string): boolean {
  return papel === 'admin_socio' || papel === 'admin_geral'
}

/**
 * Única resposta do "Pagar" quando a mensalidade não está na lista do usuário: outra Conta, id
 * inexistente e já paga não se distinguem (#773).
 */
export const MENSALIDADE_NAO_ENCONTRADA = 'Mensalidade não encontrada ou já paga'

/** O link não saiu: Mercado Pago ou banco falharam. Não diz nada sobre a mensalidade pedida. */
export const LINK_INDISPONIVEL = 'Não deu para gerar o link agora. Tente de novo em alguns minutos.'

/**
 * Valor a cobrar hoje: o da cobrança mais o acréscimo do atraso, se houver. A adesão não tem
 * multa nem juros (contrato 4.4 só fala da mensalidade).
 */
export function valorAtualizado(
  c: { tipo: TipoCobranca; valor: string | number; vencimento: string }, hoje: string,
): { acrescimo: number; total: number } {
  const valor = Number(c.valor)
  const acrescimo = c.tipo === 'adesao' ? 0 : acrescimoAtraso(valor, c.vencimento, hoje)
  return { acrescimo, total: Math.round((valor + acrescimo) * 100) / 100 }
}

/** Versão da cobrança no contrato de adesão: 1 põe a taxa na 1ª mensalidade; 2 cobra a adesão no 1º acesso. */
export const VERSAO_COBRANCA_ADESAO_NO_ACESSO = 2

/** Regime novo: o contrato assinado da adesão do grupo está na versão 2. Sem contrato assinado, antigo. */
export function ehRegimeNovo(versaoAssinada: number | null): boolean {
  return versaoAssinada === VERSAO_COBRANCA_ADESAO_NO_ACESSO
}

/**
 * Valor da cobrança da adesão no 1º acesso, ou null quando não há o que cobrar: contrato assinado
 * fora da versão 2, taxa da ficha zero ou vazia, grupo isento. A taxa da configuração de
 * mensalidade não vale aqui (decisão do Luis, #802).
 */
export function adesaoACobrar(d: { versaoAssinada: number | null; taxaFicha: string | null; isento: boolean }): number | null {
  const taxa = Number(d.taxaFicha ?? 0)
  if (!ehRegimeNovo(d.versaoAssinada) || d.isento || !(taxa > 0)) return null
  return taxa
}
