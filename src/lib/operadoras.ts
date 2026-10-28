// Sem banco: operadoras do cadastro de maquininhas (#471) e nome de marca do código gravado (#460).
import { RecusaUsuario } from '@/lib/resultado-action'

export const OPERADORAS = [
  { codigo: 'infinitypay', nome: 'InfinityPay' },
  { codigo: 'stone',       nome: 'Stone' },
  { codigo: 'pagueveloz',  nome: 'PagueVeloz' },
  { codigo: 'rede',        nome: 'Rede' },
  { codigo: 'cielo',       nome: 'Cielo' },
  { codigo: 'getnet',      nome: 'GetNet' },
  { codigo: 'mercadopago', nome: 'Mercado Pago' },
  { codigo: 'sumup',       nome: 'SumUp' },
  { codigo: 'outra',       nome: 'Outra' },
] as const

// Só estas têm leitor de relatório na conciliação; as outras se conciliam à mão.
const COM_RELATORIO = new Set(['infinitypay', 'stone', 'pagueveloz'])

export function temRelatorio(operadora: string): boolean {
  return COM_RELATORIO.has(operadora)
}

export function separarPorRelatorio<T extends { operadora: string }>(lista: T[]) {
  return { comRelatorio: lista.filter(m => temRelatorio(m.operadora)), manuais: lista.filter(m => !temRelatorio(m.operadora)) }
}

/** Código gravado: o da lista, ou o nome livre de "Outra" sem acento e espaço. Vazio = inválido. */
export function codigoOperadora(escolha: string, nomeLivre: string): string {
  if (escolha !== 'outra') return OPERADORAS.some(o => o.codigo === escolha) ? escolha : ''
  const codigo = nomeLivre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  // "Outra" chamada Stone gravaria um segundo código para a mesma operadora.
  if (OPERADORAS.some(o => o.codigo !== 'outra' && o.codigo === codigo.replace(/-/g, ''))) {
    throw new RecusaUsuario('Essa operadora já está na lista: escolha ela no campo Operadora.')
  }
  return codigo
}

// 'redecard' só aparece em registro antigo; o cadastro grava 'rede'.
const NOMES: Record<string, string> = {
  ...Object.fromEntries(OPERADORAS.filter(o => o.codigo !== 'outra').map(o => [o.codigo, o.nome])),
  redecard: 'Redecard',
}

export function nomeOperadora(codigo: string): string {
  return NOMES[codigo] ?? codigo
}
