import { ne } from 'drizzle-orm'
import { pixRecebimentosMcp } from '@/lib/db/schema'

// Pix devolvido pelo cliente (estorno do Mercado Pago). A linha continua ligada à venda/OS/peça,
// mas o dinheiro voltou: não cobre pagamento. Valor único, usado também nos SQL crus.
export const PIX_ESTORNADO = 'estornado'

// Condição Drizzle para todo leitor que mede ou mostra cobertura de pagamento por Pix.
export const pixQueCobre = ne(pixRecebimentosMcp.status, PIX_ESTORNADO)
