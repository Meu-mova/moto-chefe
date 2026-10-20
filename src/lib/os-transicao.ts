/**
 * Regra única de quem avança cada passo da OS. A action e a barra de status
 * liam cópias separadas desta tabela; fica aqui para não divergirem.
 */

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm'] as const

/**
 * Passos do mecânico também valem para o gestor (#243): quando o mecânico não
 * clica, a OS fica parada e o financeiro não consegue cobrar. O mecânico vem
 * primeiro porque a tela mostra o primeiro como "aguardando".
 */
export const RESPONSAVEL_TRANSICAO: Record<string, readonly string[]> = {
  oficina:            ['mecanico', ...GESTORES],
  em_andamento:       ['mecanico', ...GESTORES],
  finalizada:         ['mecanico', ...GESTORES],
  pendente_pagamento: GESTORES,
}

/** `passo` é o status de destino. Concluída não aparece: é automática. */
export function podeAvancarOS(passo: string, papel: string): boolean {
  return RESPONSAVEL_TRANSICAO[passo]?.includes(papel) ?? false
}
