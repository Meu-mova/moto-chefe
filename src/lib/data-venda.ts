// O <input type="date"> devolve só "YYYY-MM-DD". Jogar essa string direto no
// `new Date()` ancora o instante na meia-noite UTC — que em Brasília (UTC-3) é
// 21h do dia ANTERIOR. Aí a mesma venda aparecia com dias diferentes conforme
// quem renderizava: server component (Vercel roda em UTC) mostrava o dia certo,
// client component (fuso do navegador) mostrava o dia anterior.
//
// Ancorar ao meio-dia UTC resolve: 12:00Z é o mesmo dia do calendário em
// qualquer fuso de UTC-11 a UTC+11, então servidor e navegador nunca divergem.
export function parseDataInput(yyyyMmDd: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
    throw new Error(`Data inválida: ${yyyyMmDd}`)
  }
  return new Date(`${yyyyMmDd}T12:00:00.000Z`)
}

/**
 * "03/11/2026" → "2026-11-03". Devolve null se não for dd/mm/aaaa ou se o dia não existe
 * (31/02): quem lê arquivo de operadora recusa o arquivo em vez de gravar data torta.
 */
export function dataBrParaIso(ddmmaaaa: string): string | null {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(ddmmaaaa.trim())
  if (!m) return null
  const [, dd, mm, aaaa] = m
  const d = new Date(Date.UTC(Number(aaaa), Number(mm) - 1, Number(dd)))
  const existe = d.getUTCFullYear() === Number(aaaa) && d.getUTCMonth() === Number(mm) - 1 && d.getUTCDate() === Number(dd)
  return existe ? `${aaaa}-${mm}-${dd}` : null
}

// Hoje no calendário de Brasília, como "YYYY-MM-DD" — para default de <input
// type="date"> e de datas gravadas "de hoje".
//
// `new Date().toISOString().slice(0,10)` dá o dia em UTC: das 21h à meia-noite de
// Brasília já é o dia SEGUINTE lá. Uma venda lançada às 22h do dia 31 nascia com
// data 01 — e sumia do filtro do mês. `en-CA` formata como YYYY-MM-DD.
export function hojeBrt(agora: Date = new Date()): string {
  return agora.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

// Mês corrente no calendário de Brasília, como "YYYY-MM" — para default de
// seletor de mês. Mesmo motivo do hojeBrt: `toISOString().slice(0,7)` daria o
// mês em UTC, que na virada do mês à noite já é o mês seguinte lá.
export function mesBrt(agora: Date = new Date()): string {
  return hojeBrt(agora).slice(0, 7)
}

const MES_CURTO = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

/** 'AAAA-MM' como "out/2026". Pelo texto, sem Date, para o fuso não mudar o mês. */
export function rotuloMesCurto(mes: string): string {
  const [ano, m] = mes.split('-')
  return `${MES_CURTO[Number(m) - 1] ?? m}/${ano}`
}

/** Ano e mês como "out/26" (ano de 2 dígitos), o rótulo curto dos gráficos e das colunas por mês. */
export function rotuloMesCurtoAA(ano: number | string, mes: number | string): string {
  return `${MES_CURTO[Number(mes) - 1] ?? mes}/${String(ano).slice(2)}`
}

// ─── limites de um dia do calendário de Brasília ──────────────────────────────
// Toda coluna de data do sistema é `timestamptz`, mas o negócio raciocina em dia
// do calendário daqui. Filtrar com `new Date("2026-07-31")` compara contra a
// MEIA-NOITE UTC — e como as vendas são gravadas às 12:00Z pelo parseDataInput,
// toda venda do próprio dia 31 caía fora do filtro "até 31/07". Em julho/2026
// isso escondeu 12 vendas e R$ 159.494,46.
//
// Estas duas funções devolvem as bordas reais do dia em Brasília (UTC−3 o ano
// inteiro, sem horário de verão desde 2019), e funcionam tanto para as datas
// ancoradas ao meio-dia quanto para eventos com hora real, como a conclusão de OS.

function validar(yyyyMmDd: string): void {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(yyyyMmDd)) {
    throw new Error(`Data inválida: ${yyyyMmDd}`)
  }
}

/** 00:00 de Brasília do dia informado, em UTC. */
export function inicioDoDiaBrt(yyyyMmDd: string): Date {
  validar(yyyyMmDd)
  return new Date(`${yyyyMmDd}T03:00:00.000Z`)
}

/** 23:59:59.999 de Brasília do dia informado, em UTC. */
export function fimDoDiaBrt(yyyyMmDd: string): Date {
  validar(yyyyMmDd)
  const seguinte = new Date(`${yyyyMmDd}T03:00:00.000Z`)
  seguinte.setUTCDate(seguinte.getUTCDate() + 1)
  return new Date(seguinte.getTime() - 1)
}

/** "09/10/2026", no dia de Brasília. */
export function diaBrt(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' })
}

/** "09/10", no dia de Brasília. */
export function diaCurtoBrt(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
}

/** "09:20", no horário de Brasília. */
function horaBrt(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
}

/** "09/10 às 09:20", no horário de Brasília. */
export function diaEHoraBrt(iso: string): string {
  return `${diaCurtoBrt(iso)} às ${horaBrt(iso)}`
}

/** "13/11/2026 09:12", no horário de Brasília. */
export function dataEHoraBrt(iso: string): string {
  return `${diaBrt(iso)} ${horaBrt(iso)}`
}

/**
 * Data pura do banco como texto: 'AAAA-MM-DD' → "09/10/2026", 'AAAA-MM' → "10/2026".
 * Só reordena o texto. Não use `diaBrt` aqui: ele lê '2026-10-09' como meia-noite UTC,
 * que em Brasília ainda é dia 08.
 * Não serve para instante (texto com hora sai embaralhado): para instante, `diaBrt`.
 */
export function dataPuraBr(texto: string): string {
  return texto.split('-').reverse().join('/')
}
