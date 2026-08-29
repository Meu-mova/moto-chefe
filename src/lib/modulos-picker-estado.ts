import { ITENS, type Papel } from './navegacao'

export type EstadoModulo = 'papel' | 'liberado' | 'bloqueado' | 'sem'

export function doPapel(papel: string, id: string): boolean {
  return ITENS.find(i => i.id === id)?.papeis.includes(papel as Papel) ?? false
}

export function estado(papel: string, extras: string[], bloqueados: string[], id: string): EstadoModulo {
  if (bloqueados.includes(id)) return 'bloqueado'
  if (doPapel(papel, id)) return 'papel'
  if (extras.includes(id)) return 'liberado'
  return 'sem'
}

// Dois estados, e o significado depende do papel dar ou não o módulo:
// o que o papel dá alterna entre "do papel" e "bloqueado"; o que ele não dá
// alterna entre "não tem" e "liberado". Só a diferença é gravada.
export function alternar(
  papel: string,
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
  if (doPapel(papel, id)) {
    return { extras, bloqueados: [...bloqueados, id] }
  }
  return {
    extras: extras.includes(id) ? extras.filter(x => x !== id) : [...extras, id],
    bloqueados,
  }
}
