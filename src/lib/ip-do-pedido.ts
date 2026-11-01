// IP de quem fez o pedido. Na Vercel o IP real vem no x-forwarded-for; o primeiro da
// lista é o cliente, o resto são proxies. Vazio quando nenhum cabeçalho veio (local, teste).
export function ipDoPedido(h: Pick<Headers, 'get'>): string {
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip')?.trim() || ''
}
