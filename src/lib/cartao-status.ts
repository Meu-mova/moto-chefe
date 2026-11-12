import { and, eq, ne } from 'drizzle-orm'
import { conciliacoesCartao } from '@/lib/db/schema'

// Venda no cartão devolvida ao cliente (estorno do Mercado Pago). A linha continua ligada à
// venda/OS/peça e aparece na lista "Todas", mas o dinheiro voltou: não é pendência, não é
// candidata a vínculo e o servidor recusa vinculá-la (vincular poria o valor de volta nas somas,
// que só olham `conciliado = true`). Irmão de PIX_ESTORNADO em pix-status.ts.
export const CARTAO_ESTORNADO = 'estornado'

/** Condição Drizzle: linha de cartão que não foi estornada. */
export const cartaoNaoEstornado = ne(conciliacoesCartao.status, CARTAO_ESTORNADO)

/** Condição Drizzle: pendência de cartão (sem vínculo conciliado e não estornada). */
export const cartaoPendente = and(eq(conciliacoesCartao.conciliado, false), cartaoNaoEstornado)!
