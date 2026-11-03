import { papelAprova } from '@/lib/aprovacao-permissao'
import { PAPEIS_QUE_CANCELAM_VENDA, travaDoPapel } from '@/lib/cancelar-venda'
import type { PapelBase } from '@/lib/gestao-usuarios'
import { acessaModulo, itensDoMenu } from '@/lib/navegacao'
import { podeOperarNfSaida } from '@/app/(dashboard)/vendas/papeis-nf-saida'

export type OQueABaseFaz = {
  /** O papel pode aprovar; onde aprova (grupos de aprovação) vem do cadastro do usuário. */
  aprovaVenda: boolean
  /** 'sem-nf': cancela, mas não a venda que já tem NF registrada. */
  cancelaVenda: 'sim' | 'sem-nf' | 'nao'
  operaCaixa: boolean
  emiteNF: boolean
  /** Rótulos dos módulos que o menu mostra para a base. */
  telas: string[]
  /** A base vê só o que todos veem (Dashboard, Meus Documentos, Calendário). */
  soOBasico: boolean
}

// Lido das listas de papel que as telas e as actions consultam (aprovar, cancelar venda, caixa,
// NF), para a descrição acompanhar a regra de papel. Não substitui as conferências de grupo e de
// loja que essas actions fazem depois.
function cancelaVenda(papel: string): OQueABaseFaz['cancelaVenda'] {
  if (!PAPEIS_QUE_CANCELAM_VENDA.has(papel)) return 'nao'
  return travaDoPapel(papel, 'com-nf') ? 'sem-nf' : 'sim'
}

const rotulosDoMenu = (papel: string) => itensDoMenu({ papel }, {}).map(i => i.label)

// 'cargo' sem base vê só o que todos veem.
const TELAS_DE_TODOS = rotulosDoMenu('cargo')

export function oQueABaseFaz(papel: PapelBase): OQueABaseFaz {
  const telas = rotulosDoMenu(papel)
  return {
    aprovaVenda: papelAprova(papel),
    cancelaVenda: cancelaVenda(papel),
    operaCaixa: acessaModulo({ papel }, 'caixa'),
    emiteNF: podeOperarNfSaida(papel),
    telas,
    soOBasico: telas.length === TELAS_DE_TODOS.length && telas.every(t => TELAS_DE_TODOS.includes(t)),
  }
}
