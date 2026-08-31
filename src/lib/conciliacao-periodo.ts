import { inicioDoDiaBrt } from '@/lib/data-venda'

// A conciliação (cartão e PIX) só começou em 01/08/2026. O que existe no banco
// com data anterior veio de importação de histórico e não tem contrapartida pra
// conciliar — essas linhas só entopem a fila de pendentes e inflam os totais das
// telas. Por isso /conciliacao e /pix-mcp não mostram nada antes dessa data.
//
// Formato "YYYY-MM-DD" para colunas `date` (conciliacoes_cartao.data_transacao).
export const INICIO_CONCILIACAO = '2026-08-01'

// Mesma data como instante, para colunas `timestamptz` (pix_recebimentos_mcp.data):
// 00:00 de Brasília, não de UTC — senão o dia 31/07 depois das 21h entraria.
export const INICIO_CONCILIACAO_EM = inicioDoDiaBrt(INICIO_CONCILIACAO)
