import { hojeBrt, inicioDoDiaBrt, somarDias } from '@/lib/data-venda'

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

// Quem não é admin só vê e vincula PIX e cartão dos últimos 30 dias. Em 03/11/2026 um
// aux_adm ligou à venda 32058 (30/10) uma TED de 10/08 de outra pessoa, de mesmo valor.
export const DIAS_CONCILIACAO_SEM_ADMIN = 30

const VEEM_TUDO = new Set(['admin_geral', 'admin_socio'])

/**
 * Data mais antiga de PIX/cartão que o papel vê e vincula: 01/08/2026 para admin, e
 * para os demais (aux_adm, vendedor) o maior entre isso e hoje − 30 dias em Brasília.
 * `data` para `date` (cartão), `em` para `timestamptz` (PIX). Tela e servidor usam esta.
 */
export function corteConciliacao(papel: string, agora: Date = new Date()): { data: string; em: Date } {
  if (VEEM_TUDO.has(papel)) return { data: INICIO_CONCILIACAO, em: INICIO_CONCILIACAO_EM }
  const trinta = somarDias(hojeBrt(agora), -DIAS_CONCILIACAO_SEM_ADMIN)
  const data = trinta > INICIO_CONCILIACAO ? trinta : INICIO_CONCILIACAO
  return { data, em: inicioDoDiaBrt(data) }
}

/** Recusa padrão quando a data do PIX/cartão é anterior ao corte do papel. */
export const MSG_FORA_DO_PRAZO = `Pagamento com mais de ${DIAS_CONCILIACAO_SEM_ADMIN} dias: só um admin pode vincular`
