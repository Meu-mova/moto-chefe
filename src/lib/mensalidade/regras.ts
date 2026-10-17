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
