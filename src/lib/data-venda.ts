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

/** "09/10 às 09:20", no horário de Brasília. */
export function diaEHoraBrt(iso: string): string {
  const d = new Date(iso)
  const dia = d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit' })
  const hora = d.toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' })
  return `${dia} às ${hora}`
}
