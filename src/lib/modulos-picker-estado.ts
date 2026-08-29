import { ITENS } from './navegacao'

export type EstadoModulo = 'papel' | 'liberado' | 'bloqueado' | 'sem'

// Mesma regra de temPapelNav em navegacao.ts:120 — papel principal OU um dos
// papeisExtras concede o item. Sem isso o picker desalinha do menu real: um
// aux_adm com 'vendedor' nos extras via Vendas no menu, mas via a caixa
// desmarcada aqui, porque só o papel principal era olhado.
export function doPapel(papel: string, papeisExtras: string[], id: string): boolean {
  const item = ITENS.find(i => i.id === id)
  if (!item) return false
  return item.papeis.some(p => p === papel || papeisExtras.includes(p))
}

export function estado(
  papel: string,
  papeisExtras: string[],
  extras: string[],
  bloqueados: string[],
  id: string,
): EstadoModulo {
  if (bloqueados.includes(id)) return 'bloqueado'
  if (doPapel(papel, papeisExtras, id)) return 'papel'
  if (extras.includes(id)) return 'liberado'
  return 'sem'
}

// Dois estados, e o significado depende do papel dar ou não o módulo:
// o que o papel dá alterna entre "do papel" e "bloqueado"; o que ele não dá
// alterna entre "não tem" e "liberado". Só a diferença é gravada.
export function alternar(
  papel: string,
  papeisExtras: string[],
  extras: string[],
  bloqueados: string[],
  id: string,
): { extras: string[]; bloqueados: string[] } {
  // Desbloquear precisa funcionar mesmo que o papel atual não conceda o item:
  // o bloqueio pode ter sido posto sob outro papel, e sem este ramo a caixa
  // ficaria travada em "bloqueado" para sempre.
  if (bloqueados.includes(id)) {
    return { extras, bloqueados: bloqueados.filter(x => x !== id) }
  }
  if (doPapel(papel, papeisExtras, id)) {
    return { extras, bloqueados: [...bloqueados, id] }
  }
  return {
    extras: extras.includes(id) ? extras.filter(x => x !== id) : [...extras, id],
    bloqueados,
  }
}
