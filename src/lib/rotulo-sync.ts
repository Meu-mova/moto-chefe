// A página roda na Vercel em UTC: sem o fuso explícito, a data da última sincronização saía 3h à frente
// do relógio de Brasília (21:59 em Brasília aparecia como "15/10, 00:59").
export function rotuloSyncBrt(d: Date): string {
  const quando = d.toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
  return `Sincronizado em ${quando}`
}
