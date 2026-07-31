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
