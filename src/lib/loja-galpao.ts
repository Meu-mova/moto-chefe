// ─── Exceção pontual: reserva/venda no Galpão Matriz por qualquer vendedor ────
// Galpão Matriz é o estoque central de chegada do Sul de Minas — motos passam
// por lá antes de serem distribuídas pras lojas. Vendedor normalmente só age
// (reservar/vender) sobre moto da própria loja; aqui abrimos exceção só pra essa
// loja, só pro papel vendedor, e só pra reserva/venda — garantia, montagem e
// transferência continuam exigindo lotação na loja da moto.
//
// Extraído de grupo.ts porque é usado por componentes client-side, que não
// podem importar módulos com `next/headers` (grupo.ts importa `cookies`).
export const LOJA_GALPAO_MATRIZ_ID = 'f154c1a5-c5ed-4bdc-af14-b1dea024beae'

export function podeVendedorReservarForaDaLoja(lojaIdMoto: string): boolean {
  return lojaIdMoto === LOJA_GALPAO_MATRIZ_ID
}
