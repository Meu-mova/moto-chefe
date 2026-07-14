// Nomes que aparecem como pagador quando o PIX é uma transferência interna
// (ex: liquidação da maquininha de cartão pra conta principal, ou entre
// contas do próprio grupo) — nunca deve ser conciliado a uma venda, já que
// não é dinheiro de cliente.
const PADROES_TRANSFERENCIA_INTERNA = ['motochefe', 'ecomov']

export function ehTransferenciaInterna(pagadorNome: string | null): boolean {
  if (!pagadorNome) return false
  const nome = pagadorNome.toLowerCase()
  return PADROES_TRANSFERENCIA_INTERNA.some(p => nome.includes(p))
}
