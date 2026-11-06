/**
 * Entrega da venda (#682): onde a moto chega ao cliente e a modalidade do frete na nota. Nasce no
 * pedido, vai para a venda na efetivação e decide se a NF de saída é dentro ou fora do estado.
 * Este fluxo só oferece "Retira na loja"; "Entregar" (endereço, quem recebe, frete) vem no #726.
 */
import { ehModalidade, type ModalidadeFrete } from './transporte'

export type EntregaVenda = { modo: 'retira'; modalidade: ModalidadeFrete | '' }

/** Confere a Entrega que veio do navegador e devolve só os campos que se gravam. */
export function conferirEntrega(dado: unknown): { ok: true; entrega: EntregaVenda } | { ok: false; erro: string } {
  const { modo, modalidade } = (dado ?? {}) as { modo?: unknown; modalidade?: unknown }
  if (modo !== 'retira' || typeof modalidade !== 'string') return { ok: false, erro: 'Escolha a entrega da venda.' }
  // Vazia grava: avise, não bloqueie. Quem barra a nota sem modalidade é a prévia da NF.
  if (modalidade === '') return { ok: true, entrega: { modo, modalidade } }
  if (!ehModalidade(modalidade)) return { ok: false, erro: 'Modalidade do frete inválida.' }
  return { ok: true, entrega: { modo, modalidade } }
}
