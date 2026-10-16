// Textos da tela pública de assinatura que mudam com quem emite o documento:
// a loja (venda) ou a equipe MOVA (contrato de adesão, #165). Sem dependência
// de servidor: a tela roda no navegador.

export type TextosEmissor = {
  cancelado: string
  expirado: string
  codigosEsgotados: string
  /** Fim do aviso da foto: a alternativa a assinar pelo link. */
  alternativa: string
  conferencia: string
}

export const TEXTOS_VENDA: TextosEmissor = {
  cancelado: 'Este documento foi cancelado pela loja. Fale com a loja para receber um novo link.',
  expirado: 'Este link de assinatura expirou. Peça um novo à loja.',
  codigosEsgotados: 'Você já pediu o código o máximo de vezes. Fale com a loja para receber um link novo.',
  alternativa: 'Você pode desistir e assinar presencialmente na loja.',
  conferencia: 'A autenticidade deste documento pode ser conferida junto à loja emissora, pelo código acima.',
}

export const TEXTOS_ADESAO: TextosEmissor = {
  cancelado: 'Este contrato foi cancelado pela equipe MOVA. Fale com a equipe para receber um novo link.',
  expirado: 'Este link de assinatura expirou. Peça um novo à equipe MOVA.',
  codigosEsgotados: 'Você já pediu o código o máximo de vezes. Fale com a equipe MOVA para receber um link novo.',
  alternativa: 'Se preferir não enviar a foto, fale com a equipe MOVA.',
  conferencia: 'A autenticidade deste contrato pode ser conferida junto à equipe MOVA, pelo código acima.',
}
