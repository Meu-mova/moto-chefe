import { papelAprova } from '@/lib/aprovacao-permissao'
import { PAPEIS_QUE_CANCELAM_VENDA, travaDoPapel } from '@/lib/cancelar-venda'
import type { PapelBase } from '@/lib/cargos-opcoes'
import { acessaModulo, itensDoMenu } from '@/lib/navegacao'
import { podeOperarNfSaida } from '../app/(dashboard)/vendas/papeis-nf-saida'

export type OQueABaseFaz = {
  aprovaVenda: boolean
  /** 'sem-nf': cancela, mas não a venda que já tem NF registrada. */
  cancelaVenda: 'sim' | 'sem-nf' | 'nao'
  operaCaixa: boolean
  emiteNF: boolean
  /** Rótulos dos módulos que o menu mostra para a base. */
  telas: string[]
}

// Lido das mesmas funções que as telas e as actions usam, para a descrição do cargo nunca
// divergir do que o papel base de fato faz.
function cancelaVenda(papel: string): OQueABaseFaz['cancelaVenda'] {
  if (!PAPEIS_QUE_CANCELAM_VENDA.has(papel)) return 'nao'
  return travaDoPapel(papel, 'com-nf') ? 'sem-nf' : 'sim'
}

export function oQueABaseFaz(papel: PapelBase): OQueABaseFaz {
  return {
    aprovaVenda: papelAprova(papel),
    cancelaVenda: cancelaVenda(papel),
    operaCaixa: acessaModulo({ papel }, 'caixa'),
    emiteNF: podeOperarNfSaida(papel),
    telas: itensDoMenu({ papel }, {}).map(i => i.label),
  }
}
