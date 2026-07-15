// Data em que o grupo Sul de Minas migrou do ValidaPix (pix_recebimentos) para o
// PIX via mcp.ai/Open Finance (pix_recebimentos_mcp). Vendas anteriores a essa data
// continuam conciliando pelo sistema antigo (histórico não migrado por completo —
// muitos pagamentos de antes não têm transação correspondente sincronizada no
// mcp.ai); a partir dela, só o sistema novo é considerado.
export const CORTE_MIGRACAO_PIX = new Date('2026-07-01T00:00:00.000Z')
