// Classificação de uma categoria de despesa: operacional ou não.
//
// "Não operacional" é saída real de dinheiro que não é custo de operar a loja —
// compra de mercadoria (o custo já está no líquido da venda), retirada de sócio
// (distribuição de lucro), transferência entre os CNPJs do grupo (o dinheiro não
// saiu do grupo) e estorno ao cliente (desfaz uma receita já contada).
//
// O motivo não é rótulo decorativo: o card "Retiradas de Sócios" do /financeiro
// filtra por 'retirada_socio'. Categoria fora do cálculo sem motivo cai no
// balaio 'categoria_marcada' e some daquele card — por isso motivo é obrigatório
// aqui, mesmo o banco aceitando nulo.

import type { MotivoForaDoCalculo } from './despesas-operacionais'
import { GRUPOS_DRE, type GrupoDre } from './dre'

/** Só os motivos que fazem sentido para uma CATEGORIA de despesa. */
export const MOTIVOS_CATEGORIA = [
  { valor: 'retirada_socio',        rotulo: 'Retirada de sócio' },
  { valor: 'compra_moto',           rotulo: 'Compra de mercadoria' },
  { valor: 'transferencia_interna', rotulo: 'Transferência interna (entre CNPJs ou para o caixa da loja)' },
  { valor: 'estorno_cliente',       rotulo: 'Estorno ao cliente' },
  { valor: 'ja_lancada_manual',     rotulo: 'Já lançada manualmente' },
] as const satisfies readonly { valor: MotivoForaDoCalculo; rotulo: string }[]

export type MotivoCategoria = (typeof MOTIVOS_CATEGORIA)[number]['valor']

// 'categoria_marcada' é o que o cálculo assume quando NÃO há motivo — oferecê-lo
// na tela seria pedir para escolher "não escolhi". 'caixa_nao_despesa' pertence
// às categorias de caixa, que não têm motivo.
const VALIDOS = new Set<string>(MOTIVOS_CATEGORIA.map(m => m.valor))
const GRUPOS_VALIDOS = new Set<string>(GRUPOS_DRE.map(g => g.valor))

export function rotuloMotivo(motivo: string | null): string {
  if (!motivo) return 'Sem motivo'
  return MOTIVOS_CATEGORIA.find(m => m.valor === motivo)?.rotulo ?? motivo
}

export type Classificacao = {
  contaComoDespesa: boolean
  motivoNaoOperacional: MotivoCategoria | null
  /** Linha do DRE. Só faz sentido para categoria operacional. */
  grupoDre: GrupoDre | null
}

/**
 * Normaliza o par (conta como despesa, motivo) antes de gravar. Lança quando o
 * par não fecha, em vez de gravar meia classificação.
 *
 * Voltar para operacional APAGA o motivo: deixá-lo lá guarda uma justificativa
 * para uma exclusão que não vale mais, e ela reaparece se alguém desmarcar de
 * novo — com o motivo antigo, que ninguém conferiu.
 */
export function normalizarClassificacao(entrada: {
  contaComoDespesa: boolean
  motivoNaoOperacional?: string | null
  grupoDre?: string | null
}): Classificacao {
  if (entrada.contaComoDespesa) {
    // Grupo em branco é permitido: a leitura do DRE joga em "Outras". Exigir aqui
    // travaria o cadastro de uma categoria por causa de uma classificação que dá
    // pra ajustar depois.
    const grupo = entrada.grupoDre?.trim() || ''
    if (grupo && !GRUPOS_VALIDOS.has(grupo)) throw new Error('Grupo do DRE inválido')
    return {
      contaComoDespesa: true,
      motivoNaoOperacional: null,
      grupoDre: (grupo || null) as GrupoDre | null,
    }
  }
  const motivo = entrada.motivoNaoOperacional?.trim() || ''
  if (!motivo) {
    throw new Error('Escolha o motivo de a categoria ficar fora das despesas operacionais')
  }
  if (!VALIDOS.has(motivo)) {
    throw new Error('Motivo inválido')
  }
  // Não operacional não entra no corpo do DRE — aparece no memorando, e lá quem
  // classifica é o motivo. Guardar um grupo aqui seria dado que ninguém lê.
  return { contaComoDespesa: false, motivoNaoOperacional: motivo as MotivoCategoria, grupoDre: null }
}
