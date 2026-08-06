// Regras puras do relatório de Marketing — sem banco, testáveis direto.
// Ver docs/superpowers/specs/2026-08-06-marketing-leads-kommo-design.md

// Códigos de canal que a API do Kommo devolve em /talks (`origin`) e em
// /unsorted (`metadata.service`). O que não estiver aqui volta como veio —
// nome errado é pior que código cru.
const ORIGENS: Record<string, string> = {
  'com.amocrm.amocrmwa': 'WhatsApp',
  'whatsapp': 'WhatsApp',
  'instagram_business': 'Instagram',
  'instagram_business_comments': 'Instagram (comentário)',
  'instagram': 'Instagram',
  'facebook': 'Facebook',
  'facebook_comments': 'Facebook (comentário)',
  'telegram': 'Telegram',
  'telegram_bot': 'Telegram',
  'viber': 'Viber',
  'livechat': 'Chat do site',
  'webforms': 'Formulário do site',
  'email': 'E-mail',
  'sms': 'SMS',
}

export function nomeOrigem(origem: string | null | undefined): string | null {
  if (!origem) return null
  const limpo = origem.trim()
  if (!limpo) return null
  return ORIGENS[limpo] ?? limpo
}

// Número de WhatsApp cru (5535998847739) fica ilegível numa tabela.
export function formatarPerfil(perfil: string | null | undefined): string | null {
  if (!perfil) return null
  const p = perfil.trim()
  if (!p) return null
  if (!/^\d{10,15}$/.test(p)) return p
  const semPais = p.startsWith('55') && p.length >= 12 ? p.slice(2) : p
  const ddd = semPais.slice(0, 2)
  const resto = semPais.slice(2)
  if (resto.length < 8) return p
  return `(${ddd}) ${resto.slice(0, resto.length - 4)}-${resto.slice(-4)}`
}

export type CanalBruto = {
  sourceId: number | null
  origem?: string | null
  perfil?: string | null
  nome?: string | null
}

// Rótulo do canal na tela. Precedência: nome dado pelo humano > perfil (com o
// canal na frente) > só o canal > "Canal {id}". Lead sem source_id nenhum é
// "Não identificado" — nunca se chuta origem.
export function rotuloCanal(c: CanalBruto): string {
  const manual = c.nome?.trim()
  if (manual) return manual
  if (c.sourceId == null) return 'Não identificado'
  const canal = nomeOrigem(c.origem)
  const perfil = formatarPerfil(c.perfil)
  if (canal && perfil) return `${canal} · ${perfil}`
  if (canal) return canal
  if (perfil) return perfil
  return `Canal ${c.sourceId}`
}

// Divisões do relatório. Sem denominador não existe métrica — devolve null, que
// a tela mostra como "—". Zero seria mentira e Infinity, lixo na tabela.
export function calcularCpl(investimento: number, leads: number): number | null {
  if (!investimento || leads <= 0) return null
  return investimento / leads
}

export function calcularCac(investimento: number, ganhos: number): number | null {
  if (!investimento || ganhos <= 0) return null
  return investimento / ganhos
}

export function calcularRoas(faturamento: number, investimento: number): number | null {
  if (investimento <= 0) return null
  return faturamento / investimento
}

export function taxa(parte: number, total: number): number {
  return total > 0 ? parte / total : 0
}

// Variação vs. período anterior. Sem base anterior não há variação (null):
// "0 → 12" não é +1200%, é estreia.
export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return (atual - anterior) / anterior
}

// Período imediatamente anterior, de mesma duração, terminando na véspera do
// início. Datas em "YYYY-MM-DD" — nada de Date cru, que muda de dia no fuso.
export function periodoAnterior(de: string, ate: string): { de: string; ate: string } {
  const dia = 86_400_000
  const ini = Date.parse(`${de}T00:00:00Z`)
  const fim = Date.parse(`${ate}T00:00:00Z`)
  const dur = Math.max(0, fim - ini) + dia
  const iso = (t: number) => new Date(t).toISOString().slice(0, 10)
  return { de: iso(ini - dur), ate: iso(ini - dia) }
}

// Período longo em gráfico diário vira serrote ilegível — acima de 60 dias
// agrupa por mês.
export function granularidade(de: string, ate: string): 'dia' | 'mes' {
  const dias = (Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / 86_400_000
  return dias > 60 ? 'mes' : 'dia'
}
