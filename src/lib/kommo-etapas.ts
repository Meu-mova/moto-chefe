import { normalizar } from './telegram/texto'

// Etapas finais do funil no Kommo: "tem interesse" e "em negociação".
// Casamos pelo nome (normalizado) para que funil novo entre sozinho, sem
// configuração. Se a etapa for renomeada, a página Atendimento avisa que o
// funil ficou sem etapa de fechamento detectada.
export function etapaDeFechamento(nome: string | null | undefined): boolean {
  const n = normalizar(nome ?? '')
  return n.includes('interesse') || n.includes('negocia')
}
