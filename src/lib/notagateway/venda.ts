/**
 * Tradução da venda do MOVA para a emissão pela Nota Gateway — funções puras,
 * sem banco, para a tela e a action decidirem a mesma coisa.
 */

export type PagamentoMova = { tipo: string; valor: number; operadora?: string; parcelas?: number }
export type FormaPagamentoNfe = { tipo: string; valor: number; descricao?: string }

/**
 * Nomes que a API aceita, levantados em homologação em 29/09/2026 (a doc
 * remete a um artigo externo). Viram no XML: PIX 17, transferência 18,
 * débito 04, crédito 03, dinheiro 01, outros 99.
 */
const TIPO_NFE: Record<string, { tipo: string; descricao?: string }> = {
  dinheiro: { tipo: 'Dinheiro' },
  pix: { tipo: 'PagamentoInstantaneoPix' },
  transferencia: { tipo: 'TransferenciaBancariaCarteiraDigital' },
  cartao_debito: { tipo: 'CartaoDeDebito' },
  cartao_credito: { tipo: 'CartaoDeCredito' },
  // Link de pagamento é cobrança no cartão de crédito pela maquininha online.
  link_pagamento: { tipo: 'CartaoDeCredito' },
  financiamento: { tipo: 'Outros', descricao: 'Financiamento' },
}

export function formaPagamentoNfe(p: PagamentoMova): FormaPagamentoNfe {
  const m = TIPO_NFE[p.tipo]
  if (m) return { tipo: m.tipo, valor: p.valor, ...(m.descricao ? { descricao: m.descricao } : {}) }
  // "Não informado" e afins: a SEFAZ exige a descrição quando o tipo é Outros.
  return { tipo: 'Outros', valor: p.valor, descricao: p.tipo?.trim() || 'Não informado' }
}

export function ehCartao(tipoNfe: string) {
  return tipoNfe === 'CartaoDeCredito' || tipoNfe === 'CartaoDeDebito'
}

export function tipoPessoa(cpfCnpj: string): 'F' | 'J' {
  return cpfCnpj.replace(/\D/g, '').length === 14 ? 'J' : 'F'
}

export type ConferenciaVenda = {
  clienteNome: string | null
  clienteCpf: string | null
  clienteLogradouro: string | null
  clienteNumero: string | null
  clienteBairro: string | null
  clienteCidade: string | null
  clienteEstado: string | null
  clienteCep: string | null
  /** Só comprador CNPJ. Venda anterior à coluna vem sem os dois campos. */
  clienteIndicadorIe?: string | null
  clienteInscricaoEstadual?: string | null
  valor: number
  pagamentos: PagamentoMova[]
  temFicha: boolean
}

/**
 * O que impede transmitir. Cada item diz ONDE corrigir — o vendedor não sabe
 * o que é "enderDest", sabe o que é "editar a venda".
 *
 * Moto sem ficha fiscal não entra aqui: ela tem o próprio formulário na tela
 * (preencher e seguir), e não é defeito da venda.
 */
export function pendenciasDaVenda(v: ConferenciaVenda): string[] {
  const falta: string[] = []
  const vazio = (s: string | null) => !s || !s.trim()

  if (vazio(v.clienteNome)) falta.push('Nome do cliente — edite a venda')
  const doc = (v.clienteCpf ?? '').replace(/\D/g, '')
  if (doc.length !== 11 && doc.length !== 14) falta.push('CPF/CNPJ do cliente inválido — edite a venda')
  // A venda grava sem a IE (avise, não bloqueie; ADR-0011), mas a SEFAZ recusa
  // destinatário contribuinte sem inscrição.
  if (v.clienteIndicadorIe === 'contribuinte' && vazio(v.clienteInscricaoEstadual ?? null)) {
    falta.push('Inscrição estadual do comprador (contribuinte de ICMS) — edite a venda')
  }

  // NF-e modelo 55 exige o endereço do destinatário inteiro.
  const endereco: [string, string | null][] = [
    ['rua', v.clienteLogradouro],
    ['número', v.clienteNumero],
    ['bairro', v.clienteBairro],
    ['cidade', v.clienteCidade],
    ['UF', v.clienteEstado],
  ]
  const faltaEnd = endereco.filter(([, val]) => vazio(val)).map(([n]) => n)
  if ((v.clienteCep ?? '').replace(/\D/g, '').length !== 8) faltaEnd.push('CEP')
  if (faltaEnd.length) falta.push(`Endereço do cliente incompleto (${faltaEnd.join(', ')}) — edite a venda`)

  if (!v.pagamentos.length) {
    falta.push('A venda não tem formas de pagamento — edite a venda')
  } else {
    const soma = v.pagamentos.reduce((s, p) => s + p.valor, 0)
    if (Math.abs(soma - v.valor) > 0.01) {
      falta.push(`Os pagamentos somam R$ ${soma.toFixed(2)} e a venda é R$ ${v.valor.toFixed(2)} — edite a venda`)
    }
  }
  return falta
}

/**
 * Id que a API ecoa e usa como chave de idempotência. Uma tentativa por id:
 * nota denegada ganha um sufixo novo (a recusa comum reenvia o mesmo, #347), e reenviar o
 * MESMO id depois de um timeout consulta a nota em vez de duplicar.
 *
 * Curto de propósito: com o uuid da venda (51 caracteres) a API devolve 500
 * sem explicação (29/09/2026). O número da venda é único e cabe.
 */
export function idExternoNfe(numeroVenda: number, tentativa: number, ambiente: 'Homologacao' | 'Producao') {
  const prefixo = ambiente === 'Producao' ? 'mova' : 'mova-homolog'
  return `${prefixo}-${numeroVenda}-${tentativa}`
}

/**
 * Próxima tentativa = maior sufixo já usado + 1. Contar linhas não serve: uma
 * linha apagada faz a contagem repetir um id que já existe (29/09/2026).
 */
export function proximaTentativa(idsExistentes: string[], numeroVenda: number, ambiente: 'Homologacao' | 'Producao') {
  const prefixo = idExternoNfe(numeroVenda, 0, ambiente).slice(0, -1)
  const usados = idsExistentes
    .filter(id => id.startsWith(prefixo))
    .map(id => Number(id.slice(prefixo.length)))
    .filter(n => Number.isInteger(n) && n > 0)
  return (usados.length ? Math.max(...usados) : 0) + 1
}
