// A lista de Lançamentos mistura despesa manual (valor negativo, como vem do extrato) e saída do caixa
// (normalizada para negativo em despesas/page.tsx): o sinal que vale é sempre o de saída. Prefixar "-"
// num valor que já é negativo dava "--R$ 14,00".
export function moedaDeSaida(valor: string | number): string {
  const abs = Math.abs(Number(valor))
  return `-${abs.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`
}
