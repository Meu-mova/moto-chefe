// Nomes que aparecem como pagador quando o PIX é uma transferência interna
// (ex: liquidação da maquininha de cartão pra conta principal, ou entre
// contas do próprio grupo) — nunca deve ser conciliado a uma venda, já que
// não é dinheiro de cliente. "motochefe"/"ecomov" são do Sul de Minas;
// "prime mobilidade eletrica" é o equivalente do grupo BH.
const PADROES_TRANSFERENCIA_INTERNA = ['motochefe', 'ecomov', 'prime mobilidade eletrica']

export function ehTransferenciaInterna(pagadorNome: string | null): boolean {
  if (!pagadorNome) return false
  const nome = pagadorNome.toLowerCase()
  return PADROES_TRANSFERENCIA_INTERNA.some(p => nome.includes(p))
}
