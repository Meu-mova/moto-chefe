/**
 * Troca só o nome exibido do remetente, mantendo o endereço do EMAIL_FROM
 * (o domínio verificado no Resend). Sem nome, devolve o EMAIL_FROM como está.
 */
export function montarRemetente(fromEnv: string, nome?: string | null): string {
  // Aspas e sinais de ângulo quebrariam o cabeçalho "De"; quebra de linha abriria injeção de cabeçalho.
  const limpo = (nome ?? '').replace(/[\r\n"<>\\]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!limpo) return fromEnv
  const m = fromEnv.match(/<([^>]+)>/)
  const endereco = (m ? m[1] : fromEnv).trim()
  return `"${limpo}" <${endereco}>`
}
