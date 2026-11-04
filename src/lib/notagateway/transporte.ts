import { ufValida } from '@/lib/sefaz/uf'
import { cnpjValido, cpfValido } from '@/lib/documento'

export const MODALIDADES_FRETE = [
  ['PorContaDoRemetente', '0 · Por conta do remetente'],
  ['PorContaDoDestinatario', '1 · Por conta do destinatário'],
  ['PorContaDeTerceiros', '2 · Por conta de terceiros'],
  ['TransporteProprioPorContaDoRemetente', '3 · Transporte próprio por conta do remetente'],
  ['TransporteProprioPorContaDoDestinatario', '4 · Transporte próprio por conta do destinatário'],
  ['SemTransporte', '9 · Sem transporte'],
] as const

export type ModalidadeFrete = (typeof MODALIDADES_FRETE)[number][0]

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

const CAMPOS_ENDERECO: [keyof EnderecoEntrega, string][] = [
  ['cpfCnpjDestinatario', 'CPF ou CNPJ do destinatário'], ['logradouro', 'logradouro'],
  ['numero', 'número'], ['bairro', 'bairro'], ['cidade', 'código IBGE do município'], ['uf', 'UF'],
]

export function normalizarDadosTransporte(dados: DadosTransporte): DadosTransporte {
  return {
    modalidade: dados.modalidade,
    ...(dados.enderecoEntrega ? { enderecoEntrega: {
      ...dados.enderecoEntrega,
      cpfCnpjDestinatario: dados.enderecoEntrega.cpfCnpjDestinatario.replace(/\D/g, ''),
      logradouro: dados.enderecoEntrega.logradouro.trim(), numero: dados.enderecoEntrega.numero.trim(),
      bairro: dados.enderecoEntrega.bairro.trim(), cidade: dados.enderecoEntrega.cidade.trim(),
      uf: dados.enderecoEntrega.uf.trim().toUpperCase(),
    } } : {}),
  }
}

export function validarDadosTransporte(
  dados: DadosTransporte | null | undefined,
  exigeEntrega: boolean,
): { ok: true; dados: DadosTransporte } | { ok: false; erro: string } {
  if (!dados?.modalidade) return { ok: false, erro: 'Selecione a modalidade do frete.' }
  if (!MODALIDADES_FRETE.some(([token]) => token === dados.modalidade)) return { ok: false, erro: 'Modalidade do frete inválida.' }
  const normalizados = normalizarDadosTransporte(dados)
  if (!exigeEntrega) return { ok: true, dados: { modalidade: normalizados.modalidade } }
  if (!normalizados.enderecoEntrega) return { ok: false, erro: 'Preencha os dados do local de entrega.' }

  const endereco = normalizados.enderecoEntrega
  const faltantes = CAMPOS_ENDERECO.filter(([campo]) => !endereco[campo]).map(([, rotulo]) => rotulo)
  if (faltantes.length) return { ok: false, erro: `Preencha os dados de entrega: ${faltantes.join(', ')}.` }
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
  const modalidade = MODALIDADES_FRETE.find(([token]) => token === t?.frete?.modalidade)?.[0]
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
