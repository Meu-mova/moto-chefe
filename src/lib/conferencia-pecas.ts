/**
 * Estado de cada linha de peça na conferência da nota (#427). A tela edita texto; aqui
 * se decide o que impede gravar (estoque inteiro, preço da peça nova) e o que só avisa.
 */
import type { ItemPecaNfe } from '@/lib/nfe-entrada'
import type { LinhaEntradaPeca } from '@/lib/entrada-pecas'

export type Destino = 'catalogo' | 'nova' | 'ignorar'

export type LinhaConferencia = {
  item: ItemPecaNfe
  /** Como a pessoa digitou, com vírgula. */
  quantidade: string
  destino: Destino
  pecaId: string
  nome: string
  preco: string
}

const numero = (s: string) => Number(s.replace(/\./g, '').replace(',', '.').trim())

export function linhaInicial(item: ItemPecaNfe, sugestao: string | null): LinhaConferencia {
  return {
    item,
    quantidade: String(item.quantidade).replace('.', ','),
    destino: sugestao ? 'catalogo' : 'nova',
    pecaId: sugestao ?? '',
    nome: sugestao ? '' : item.nomeLegivel,
    preco: '',
  }
}

/** O que impede a linha de entrar; `null` se pode gravar. */
export function problemaDaLinha(l: LinhaConferencia): string | null {
  if (l.destino === 'ignorar') return null
  const q = numero(l.quantidade)
  if (!Number.isInteger(q) || q <= 0) return 'A quantidade precisa ser um número inteiro maior que zero.'
  if (l.destino === 'catalogo' && !l.pecaId) return 'Escolha a peça do catálogo.'
  if (l.destino === 'nova') {
    if (!l.nome.trim()) return 'Informe o nome da peça nova.'
    if (!(numero(l.preco) > 0)) return 'Informe o preço de venda da peça nova.'
  }
  return null
}

// Unidades em que um item da nota costuma trazer várias peças (P1).
const UNIDADES_DE_VARIAS = ['CX', 'CAIXA', 'KIT', 'PCT', 'PACOTE', 'JG', 'JOGO']

/** Aviso que não impede gravar. */
export function avisoDaLinha(l: LinhaConferencia): string | null {
  if (l.destino === 'ignorar') return null
  return UNIDADES_DE_VARIAS.includes(l.item.unidade.toUpperCase())
    ? `A nota diz ${l.item.unidade.toUpperCase()}: confira quantas unidades entram.`
    : null
}

export function resumoDaLinha(l: LinhaConferencia, loja: string, nomePeca?: string): string {
  if (l.destino === 'ignorar') return 'Esta linha não entra no estoque.'
  const qtd = `${l.quantidade} ${numero(l.quantidade) === 1 ? 'unidade' : 'unidades'}`
  return l.destino === 'nova'
    ? `Vai cadastrar a peça e somar ${qtd} na ${loja}.`
    : `Vai somar ${qtd} em ${nomePeca ?? 'a peça escolhida'} na ${loja}.`
}

/** Linhas prontas para o servidor; quem chama confere antes que nenhuma tem problema. */
export function paraGravacao(linhas: LinhaConferencia[]): LinhaEntradaPeca[] {
  return linhas.filter(l => l.destino !== 'ignorar').map(l => {
    const base = { codigo: l.item.codigo, nomeXml: l.item.nomeXml, quantidade: numero(l.quantidade), custoUnitario: l.item.custoUnitario }
    return l.destino === 'nova'
      ? { ...base, nova: { nome: l.nome.trim(), valor: numero(l.preco) } }
      : { ...base, pecaId: l.pecaId }
  })
}
