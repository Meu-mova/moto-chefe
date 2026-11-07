import { UFS, ufValida } from '@/lib/sefaz/uf'
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

/** Recusa de modalidade fora da lista, a mesma no faturamento direto e na Entrega da venda. */
export const MODALIDADE_INVALIDA = 'Modalidade do frete inválida.'

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
  /** Manual da NG para NF-e modelo 55: opcional. A Entrega da venda manda o nome de quem recebe. */
  nomeDestinatario?: string
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
  /** A Nota Gateway aceita nome ou código IBGE; o fluxo coleta o código. */
  cidade: string
  uf: string
  cep?: string
}

/** O lugar da entrega, sem quem recebe: o que a Entrega da venda guarda e a NF exige. */
export type LocalDeEntrega = Pick<EnderecoEntrega, 'logradouro' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf' | 'cep'>

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

/** Tamanho máximo de xNome, xLgr, nro, xCpl e xBairro no XML da NF-e (MOC 7.0). */
export const LIMITE_TEXTO_XML = 60

const CAMPOS_LOCAL: [keyof LocalDeEntrega, string][] = [
  ['logradouro', 'logradouro'], ['numero', 'número'], ['bairro', 'bairro'], ['cidade', 'código IBGE do município'], ['uf', 'UF'],
]

const ROTULO_LONGO = { logradouro: 'logradouro', numero: 'número', complemento: 'complemento', bairro: 'bairro' } as const

const faltantesDoLocal = (local: LocalDeEntrega) => CAMPOS_LOCAL.filter(([campo]) => !local[campo]).map(([, rotulo]) => rotulo)

const erroDeFormatoDoLocal = (local: LocalDeEntrega): string | null => {
  const longo = (Object.keys(ROTULO_LONGO) as (keyof typeof ROTULO_LONGO)[]).find(c => (local[c] ?? '').length > LIMITE_TEXTO_XML)
  if (longo) return `O ${ROTULO_LONGO[longo]} da entrega aceita no máximo ${LIMITE_TEXTO_XML} caracteres.`
  if (!ufValida(local.uf)) return 'UF de entrega inválida.'
  if (local.cep && !/^\d{8}$/.test(local.cep)) return 'O CEP da entrega deve ter 8 dígitos.'
  return null
}

/** Município em código IBGE e da UF da entrega: MOC 7.0 Anexo I, G07-30 (rejeição 279). */
const erroDoMunicipio = (local: LocalDeEntrega): string | null => {
  if (!/^\d{7}$/.test(local.cidade)) return 'Código IBGE do município deve ter 7 dígitos.'
  if (UFS.find(u => u.sigla === local.uf)?.codigo !== local.cidade.slice(0, 2)) return 'O código IBGE do município não é da UF de entrega.'
  return null
}

export const NOME_DE_QUEM_RECEBE_LONGO = `O nome de quem recebe aceita no máximo ${LIMITE_TEXTO_XML} caracteres.`

/** O que falta ou está errado no lugar da entrega (já normalizado); null se a NF aceita. */
export function erroDoLocalDeEntrega(local: LocalDeEntrega): string | null {
  const faltantes = faltantesDoLocal(local)
  if (faltantes.length) return `Preencha os dados de entrega: ${faltantes.join(', ')}.`
  return erroDeFormatoDoLocal(local) ?? erroDoMunicipio(local)
}

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
      ...(dados.enderecoEntrega.nomeDestinatario !== undefined ? { nomeDestinatario: dados.enderecoEntrega.nomeDestinatario.trim() } : {}),
      ...(dados.enderecoEntrega.complemento !== undefined ? { complemento: dados.enderecoEntrega.complemento.trim() } : {}),
    } } : {}),
  }
}

export function validarDadosTransporte(
  dados: DadosTransporte | null | undefined,
): { ok: true; dados: DadosTransporte } | { ok: false; erro: string } {
  if (!dados?.modalidade) return { ok: false, erro: 'Selecione a modalidade do frete.' }
  if (!ehModalidade(dados.modalidade)) return { ok: false, erro: MODALIDADE_INVALIDA }
  const normalizados = normalizarDadosTransporte(dados)
  if (!normalizados.enderecoEntrega) return { ok: false, erro: 'Preencha os dados do local de entrega.' }

  const endereco = normalizados.enderecoEntrega
  const faltantes = [...(endereco.cpfCnpjDestinatario ? [] : ['CPF ou CNPJ do destinatário']), ...faltantesDoLocal(endereco)]
  if (faltantes.length) return { ok: false, erro: `Preencha os dados de entrega: ${faltantes.join(', ')}.` }
  const formato = erroDeFormatoDoLocal(endereco)
  if (formato) return { ok: false, erro: formato }
  if ((endereco.nomeDestinatario ?? '').length > LIMITE_TEXTO_XML) return { ok: false, erro: NOME_DE_QUEM_RECEBE_LONGO }
  if (endereco.cpfCnpjDestinatario.length === 11 && !cpfValido(endereco.cpfCnpjDestinatario)) return { ok: false, erro: 'CPF do destinatário inválido.' }
  if (endereco.cpfCnpjDestinatario.length === 14 && !cnpjValido(endereco.cpfCnpjDestinatario)) return { ok: false, erro: 'CNPJ do destinatário inválido.' }
  if (![11, 14].includes(endereco.cpfCnpjDestinatario.length)) return { ok: false, erro: 'CPF ou CNPJ do destinatário deve ter 11 ou 14 dígitos.' }
  const municipio = erroDoMunicipio(endereco)
  if (municipio) return { ok: false, erro: municipio }
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
