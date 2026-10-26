// CPF/CNPJ. A formatação estava copiada em três telas de Clientes; o código novo
// (venda de peças e OS para empresa) usa daqui.

export function soDigitosDoc(v: string | null | undefined): string {
  return (v ?? '').replace(/\D/g, '')
}

/** Formata pelo comprimento: 11 dígitos vira CPF, 14 vira CNPJ. Qualquer outra
 *  coisa sai como veio — documento estrangeiro ou meio digitado não é erro aqui,
 *  quem barra é `validarDocumento` ou `lerDocumentoCliente` no momento de gravar. */
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

/** Tipo de pessoa pelo tamanho do documento: 14 dígitos é CNPJ, o resto conta como pessoa física. */
export function tipoPessoaDoDocumento(documento: string | null | undefined): TipoPessoa {
  return soDigitosDoc(documento).length === 14 ? 'juridica' : 'fisica'
}

/** Como `tipoPessoaDoDocumento`, mas null enquanto o documento não tem 11 nem 14
 *  dígitos: a tela não troca rótulo nem etiqueta no meio da digitação. Não confere
 *  o dígito verificador; quem barra é `lerDocumentoCliente`. */
export function tipoPessoaSeCompleto(documento: string | null | undefined): TipoPessoa | null {
  const tamanho = soDigitosDoc(documento).length
  if (tamanho === 14) return 'juridica'
  if (tamanho === 11) return 'fisica'
  return null
}

export function rotuloDocumento(documento: string | null | undefined): 'CPF' | 'CNPJ' {
  return tipoPessoaDoDocumento(documento) === 'juridica' ? 'CNPJ' : 'CPF'
}

/**
 * Valida o documento do tomador da venda de peças e da OS pelo tipo de pessoa.
 *
 * Confere o dígito verificador, como a venda de moto (ADR-0015, #399). Vale para o
 * documento digitado no balcão; o cadastro de clientes ainda não confere, e a OS com
 * cliente do cadastro não passa por aqui.
 * Pessoa física pode ficar sem documento. Devolve o documento limpo (só dígitos) ou
 * uma mensagem de erro.
 */
export function validarDocumento(
  tipoPessoa: string,
  documento: string | null | undefined,
): { ok: true; documento: string | null } | { ok: false; erro: string } {
  const d = soDigitosDoc(documento)

  if (tipoPessoa === 'juridica') {
    if (d.length !== 14) return { ok: false, erro: 'CNPJ deve ter 14 dígitos' }
    if (!cnpjValido(d)) return { ok: false, erro: 'CNPJ inválido. Confira os números.' }
    return { ok: true, documento: d }
  }

  // Pessoa física: documento é opcional — o balcão vende sem pedir CPF.
  if (!d) return { ok: true, documento: null }
  if (d.length !== 11) return { ok: false, erro: 'CPF deve ter 11 dígitos' }
  if (!cpfValido(d)) return { ok: false, erro: 'CPF inválido. Confira os números.' }
  return { ok: true, documento: d }
}

export function cpfValido(valor: string): boolean {
  const cpf = soDigitosDoc(valor)
  if (cpf.length !== 11) return false
  // 111.111.111-11 e afins passam na conta do dígito verificador mas não existem.
  if (/^(\d)\1{10}$/.test(cpf)) return false

  const digito = (ate: number): number => {
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(cpf[i]) * (ate + 1 - i)
    const resto = (soma * 10) % 11
    return resto === 10 ? 0 : resto
  }

  return digito(9) === Number(cpf[9]) && digito(10) === Number(cpf[10])
}

export function cnpjValido(valor: string): boolean {
  const cnpj = soDigitosDoc(valor)
  if (cnpj.length !== 14) return false
  // 00.000.000/0000-00 e afins passam na conta do dígito verificador mas não existem.
  if (/^(\d)\1{13}$/.test(cnpj)) return false
  const digito = (ate: number): number => {
    // Pesos de 2 a 9, da direita para a esquerda, recomeçando depois do 9.
    let soma = 0
    for (let i = 0; i < ate; i++) soma += Number(cnpj[i]) * (((ate - 1 - i) % 8) + 2)
    const resto = soma % 11
    return resto < 2 ? 0 : 11 - resto
  }
  return digito(12) === Number(cnpj[12]) && digito(13) === Number(cnpj[13])
}

/**
 * Lê o CPF/CNPJ do cliente na venda, reserva e demanda: o tipo de pessoa sai do
 * tamanho (11 = física, 14 = jurídica).
 */
export function lerDocumentoCliente(
  texto: string | null | undefined,
): { ok: true; tipoPessoa: TipoPessoa; documento: string } | { ok: false; erro: string } {
  const d = soDigitosDoc(texto)
  if (d.length === 14) {
    if (!cnpjValido(d)) return { ok: false, erro: 'CNPJ inválido. Confira os números.' }
    return { ok: true, tipoPessoa: 'juridica', documento: d }
  }
  if (d.length !== 11) return { ok: false, erro: 'Informe o CPF (11 dígitos) ou o CNPJ (14 dígitos)' }
  if (!cpfValido(d)) return { ok: false, erro: 'CPF inválido. Confira os números.' }
  return { ok: true, tipoPessoa: 'fisica', documento: d }
}

/** Máscara do campo CPF/CNPJ enquanto se digita. */
export function mascararCpfCnpj(texto: string): string {
  const d = soDigitosDoc(texto).slice(0, 14)
  if (d.length > 11) {
    return d
      .replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{1,2})?$/, (_, a, b, c, e, f) =>
        `${a}.${b}.${c}/${e}${f ? `-${f}` : ''}`)
  }
  return d
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/(\d{3})\.(\d{3})\.(\d{3})(\d{1})/, '$1.$2.$3-$4')
}

/** indIEDest da NF-e: 1 contribuinte (com IE), 2 contribuinte isento de inscrição,
 *  9 não contribuinte. Vem do cadastro da empresa, não da finalidade da compra
 *  (resposta da contabilidade na #65, 14/10/2026). */
export type IndicadorIe = 'contribuinte' | 'isento' | 'nao_contribuinte'

export function isIndicadorIe(v: string): v is IndicadorIe {
  return v === 'contribuinte' || v === 'isento' || v === 'nao_contribuinte'
}

/** Lê o que a tela mandou sobre ICMS. Só comprador CNPJ tem indicador; sem
 *  escolha é não contribuinte, o caso mais comum. */
export function lerContribuinteIcms(
  documento: string | null | undefined,
  indicador: string | null | undefined,
  inscricaoEstadual: string | null | undefined,
): { indicadorIe: IndicadorIe | null; inscricaoEstadual: string | null } {
  if (tipoPessoaDoDocumento(documento) !== 'juridica') return { indicadorIe: null, inscricaoEstadual: null }
  const ind = indicador || 'nao_contribuinte'
  if (!isIndicadorIe(ind)) throw new Error('Escolha se a empresa é contribuinte de ICMS, isenta ou não contribuinte.')
  // A NF-e leva a IE só com dígitos; a máscara muda de estado para estado.
  const ie = ind === 'contribuinte' ? soDigitosDoc(inscricaoEstadual) || null : null
  return { indicadorIe: ind, inscricaoEstadual: ie }
}
