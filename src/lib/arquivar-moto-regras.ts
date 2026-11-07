// Regras do Arquivar moto (#677, #688): puras, usadas pelo diálogo e pelo servidor.

/** O que a moto ainda tem em aberto. Venda cancelada apaga a linha, então "tem venda" é a venda viva. */
export type PendenciasDaMoto = {
  temVenda: boolean
  reservaAtiva: boolean
  pedidoPendente: boolean
  aprovacaoPendente: boolean
  transferenciaPendente: boolean
  osAberta: { numero: number | null } | null
  garantiaAtiva: boolean
}

export const SEM_PENDENCIA: PendenciasDaMoto = {
  temVenda: false, reservaAtiva: false, pedidoPendente: false, aprovacaoPendente: false,
  transferenciaPendente: false, osAberta: null, garantiaAtiva: false,
}

// O admin_rede chega aqui como admin_socio (usuarioDaRede); o aux_adm fica de fora (#677).
const PAPEIS_QUE_ARQUIVAM = ['admin_geral', 'admin_socio']

export const podeArquivarMotos = (papel: string): boolean => PAPEIS_QUE_ARQUIVAM.includes(papel)

// Ordem da lista = ordem da frase mostrada: a venda primeiro, porque a saída dela é outra ação.
const RECUSAS: [(p: PendenciasDaMoto) => boolean, (p: PendenciasDaMoto) => string][] = [
  [p => p.temVenda, () => 'Tem venda registrada. Cancele a venda antes de arquivar.'],
  [p => p.reservaAtiva, () => 'Tem reserva em aberto. Cancele ou finalize a reserva antes de arquivar.'],
  [p => p.pedidoPendente, () => 'Tem pedido de venda em aberto. Efetive ou cancele o pedido antes de arquivar.'],
  [p => p.aprovacaoPendente, () => 'Tem venda aguardando aprovação. Aprove ou recuse antes de arquivar.'],
  [p => p.transferenciaPendente, () => 'Tem transferência em aberto. Aceite ou recuse antes de arquivar.'],
  [p => p.osAberta !== null, p => p.osAberta?.numero != null ? `Feche a OS nº ${p.osAberta.numero} antes de arquivar.` : 'Feche a OS aberta antes de arquivar.'],
  [p => p.garantiaAtiva, () => 'Tem garantia ativa. Encerre a garantia antes de arquivar.'],
]

export function motivoQueImpedeArquivar(p: PendenciasDaMoto): string | null {
  const recusa = RECUSAS.find(([trava]) => trava(p))
  return recusa ? recusa[1](p) : null
}

/** O motivo do arquivamento só precisa dizer alguma coisa. A tela habilita o envio pela mesma regra. */
export const motivoDoArquivoValido = (motivo: string): boolean => motivo.trim().length > 0

/** Recusa o lote inteiro se faltar motivo, faltar moto ou uma delas estiver travada. */
export function recusaDoLote(lote: { motivo: string; motos: { chassi: string; pendencias: PendenciasDaMoto }[] }): string | null {
  if (!motivoDoArquivoValido(lote.motivo)) return 'Escreva o motivo do arquivamento.'
  if (lote.motos.length === 0) return 'Escolha ao menos uma moto.'
  const travada = lote.motos
    .map(m => ({ chassi: m.chassi, motivo: motivoQueImpedeArquivar(m.pendencias) }))
    .find(m => m.motivo !== null)
  return travada ? `${travada.chassi}: ${travada.motivo}` : null
}

/** Vender, reservar, pedir, transferir ou abrir garantia em moto arquivada (#688, decisão do Luis). */
export const MOTO_ARQUIVADA = 'Esta moto está arquivada. Desarquive pelo RADAR.'

/** Entrada de um chassi que já é moto arquivada da Conta (#691). */
export const CHASSI_ARQUIVADO = 'Este chassi está arquivado. Desarquive pelo RADAR.'
