import { ufValida } from '@/lib/sefaz/uf'
import { cnpjValido, cpfValido, soDigitosDoc } from '@/lib/documento'
import { tipoPessoa } from './venda'

/**
 * Modalidades do frete da NF-e 4.0 (MOC 7.0, campo X02) com os nomes da KB 170207 da Nota Gateway.
 * A ordem é a da tela, aprovada no protótipo da #682.
 */
export const MODALIDADES_FRETE = [
  { texto: 'Sem frete', codigo: 9, token: 'SemOcorrenciaDeTransporte' },
  { texto: 'Cliente leva com veículo próprio', codigo: 4, token: 'TransporteProprioPorContaDoDestinatario' },
  { texto: 'Loja leva com veículo próprio', codigo: 3, token: 'TransporteProprioPorContaDoRemetente' },
  { texto: 'Cliente contrata e paga a transportadora', codigo: 1, token: 'ContratacaoPorContaDoDestinatario' },
  { texto: 'Loja contrata e paga a transportadora', codigo: 0, token: 'ContratacaoPorContaDoRemetente' },
  { texto: 'Outra pessoa contrata o frete', codigo: 2, token: 'ContratacaoPorContaDeTerceiros' },
] as const

export type ModalidadeFrete = (typeof MODALIDADES_FRETE)[number]['token']

export const ehModalidade = (token: unknown): token is ModalidadeFrete => MODALIDADES_FRETE.some(m => m.token === token)

/** Texto da tela para a modalidade gravada; vazia ou fora da lista não tem texto. */
export const textoDaModalidade = (token: string): string | undefined => MODALIDADES_FRETE.find(m => m.token === token)?.texto

/**
 * Nomes que o MOVA gravou da v1.21.1 até o #723, pelo código do DANFE: dois da NF-e 3.10 (KB 170207) e o
 * `SemTransporte`, que não existe na doc. Só servem para reabrir a recusa; nunca se enviam.
 */
const CODIGO_DO_NOME_ANTIGO: Record<string, (typeof MODALIDADES_FRETE)[number]['codigo']> = {
  PorContaDoDestinatario: 1, PorContaDeTerceiros: 2, SemTransporte: 9,
}

const modalidadeLida = (token: unknown): ModalidadeFrete | undefined => {
  if (ehModalidade(token)) return token
  const codigo = typeof token === 'string' ? CODIGO_DO_NOME_ANTIGO[token] : undefined
  return MODALIDADES_FRETE.find(m => m.codigo === codigo)?.token
}

export type EnderecoEntrega = {
  tipoPessoaDestinatario: 'F' | 'J'
  cpfCnpjDestinatario: string
  logradouro: string
  numero: string
  bairro: string
  /** A Nota Gateway aceita nome ou código IBGE; o fluxo coleta o código. */
  cidade: string
  uf: string
}

export type DadosTransporte = {
  modalidade: ModalidadeFrete | ''
  enderecoEntrega?: EnderecoEntrega
}

export const DADOS_TRANSPORTE_VAZIOS = {
  modalidade: '',
  enderecoEntrega: {
    tipoPessoaDestinatario: 'F', cpfCnpjDestinatario: '', logradouro: '', numero: '',
    bairro: '', cidade: '', uf: '',
  },
} satisfies DadosTransporte

/** Tamanho máximo de xLgr, nro e xBairro no XML da NF-e (MOC 7.0). */
const LIMITE_TEXTO_XML = 60

const CAMPOS_ENDERECO: [keyof EnderecoEntrega, string][] = [
  ['cpfCnpjDestinatario', 'CPF ou CNPJ do destinatário'], ['logradouro', 'logradouro'],
  ['numero', 'número'], ['bairro', 'bairro'], ['cidade', 'código IBGE do município'], ['uf', 'UF'],
]

export function normalizarDadosTransporte(dados: DadosTransporte): DadosTransporte {
  return {
    modalidade: dados.modalidade,
    ...(dados.enderecoEntrega ? { enderecoEntrega: {
      ...dados.enderecoEntrega,
      cpfCnpjDestinatario: soDigitosDoc(dados.enderecoEntrega.cpfCnpjDestinatario),
      tipoPessoaDestinatario: tipoPessoa(dados.enderecoEntrega.cpfCnpjDestinatario),
      logradouro: dados.enderecoEntrega.logradouro.trim(), numero: dados.enderecoEntrega.numero.trim(),
      bairro: dados.enderecoEntrega.bairro.trim(), cidade: dados.enderecoEntrega.cidade.trim(),
      uf: dados.enderecoEntrega.uf.trim().toUpperCase(),
    } } : {}),
  }
}

export function validarDadosTransporte(
  dados: DadosTransporte | null | undefined,
): { ok: true; dados: DadosTransporte } | { ok: false; erro: string } {
  if (!dados?.modalidade) return { ok: false, erro: 'Selecione a modalidade do frete.' }
  if (!ehModalidade(dados.modalidade)) return { ok: false, erro: 'Modalidade do frete inválida.' }
  const normalizados = normalizarDadosTransporte(dados)
  if (!normalizados.enderecoEntrega) return { ok: false, erro: 'Preencha os dados do local de entrega.' }

  const endereco = normalizados.enderecoEntrega
  const faltantes = CAMPOS_ENDERECO.filter(([campo]) => !endereco[campo]).map(([, rotulo]) => rotulo)
  if (faltantes.length) return { ok: false, erro: `Preencha os dados de entrega: ${faltantes.join(', ')}.` }
  const longo = (['logradouro', 'numero', 'bairro'] as const).find(c => endereco[c].length > LIMITE_TEXTO_XML)
  if (longo) return { ok: false, erro: `O ${longo === 'numero' ? 'número' : longo} da entrega aceita no máximo ${LIMITE_TEXTO_XML} caracteres.` }
  if (!ufValida(endereco.uf)) return { ok: false, erro: 'UF de entrega inválida.' }
  if (endereco.cpfCnpjDestinatario.length === 11 && !cpfValido(endereco.cpfCnpjDestinatario)) return { ok: false, erro: 'CPF do destinatário inválido.' }
  if (endereco.cpfCnpjDestinatario.length === 14 && !cnpjValido(endereco.cpfCnpjDestinatario)) return { ok: false, erro: 'CNPJ do destinatário inválido.' }
  if (![11, 14].includes(endereco.cpfCnpjDestinatario.length)) return { ok: false, erro: 'CPF ou CNPJ do destinatário deve ter 11 ou 14 dígitos.' }
  if (!/^\d{7}$/.test(endereco.cidade)) return { ok: false, erro: 'Código IBGE do município deve ter 7 dígitos.' }
  return { ok: true, dados: normalizados }
}

/** Lê de volta o `transporte` de um payload já enviado (reabrir a recusa sem digitar de novo). */
export function transporteDoPayload(payload: unknown): DadosTransporte | null {
  const t = (payload as { transporte?: { frete?: { modalidade?: unknown }; enderecoEntrega?: Record<string, unknown> } } | null)?.transporte
  const modalidade = modalidadeLida(t?.frete?.modalidade)
  if (!modalidade) return null
  const e = t?.enderecoEntrega
  if (!e) return { modalidade }
  const texto = (campo: string) => String(e[campo] ?? '')
  return {
    modalidade,
    enderecoEntrega: {
      tipoPessoaDestinatario: e.tipoPessoaDestinatario === 'J' ? 'J' : 'F',
      cpfCnpjDestinatario: texto('cpfCnpjDestinatario'), logradouro: texto('logradouro'), numero: texto('numero'),
      bairro: texto('bairro'), cidade: texto('cidade'), uf: texto('uf'),
    },
  }
}
