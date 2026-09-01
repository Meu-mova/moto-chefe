// CPF/CNPJ. A formatação estava copiada em três telas de Clientes; o código novo
// (venda de peças e OS para empresa) usa daqui.

export function soDigitosDoc(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

/** Formata pelo comprimento: 11 dígitos vira CPF, 14 vira CNPJ. Qualquer outra
 *  coisa sai como veio — documento estrangeiro ou meio digitado não é erro aqui,
 *  quem barra é `validarDocumento` no momento de gravar. */
export function formatarCpfCnpj(v: string | null | undefined): string {
  const d = soDigitosDoc(v)
  if (d.length === 11) return d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4')
  if (d.length === 14) return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5')
  return v ?? ''
}

export type TipoPessoa = 'fisica' | 'juridica'

export function isTipoPessoa(v: string): v is TipoPessoa {
  return v === 'fisica' || v === 'juridica'
}

/**
 * Valida o documento do tomador da venda pelo tipo de pessoa.
 *
 * Só confere o comprimento, de propósito: não há verificação de dígito
 * verificador em nenhum outro cadastro do sistema, e barrar aqui um CNPJ que o
 * cadastro de clientes aceita travaria a venda no balcão. Devolve o documento
 * limpo (só dígitos) ou uma mensagem de erro.
 */
export function validarDocumento(
  tipoPessoa: string,
  documento: string | null | undefined,
): { ok: true; documento: string | null } | { ok: false; erro: string } {
  const d = soDigitosDoc(documento)

  if (tipoPessoa === 'juridica') {
    if (d.length !== 14) return { ok: false, erro: 'CNPJ deve ter 14 dígitos' }
    return { ok: true, documento: d }
  }

  // Pessoa física: documento é opcional — o balcão vende sem pedir CPF.
  if (!d) return { ok: true, documento: null }
  if (d.length !== 11) return { ok: false, erro: 'CPF deve ter 11 dígitos' }
  return { ok: true, documento: d }
}
