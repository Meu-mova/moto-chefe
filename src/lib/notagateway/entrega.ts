/**
 * Entrega da venda (#682): onde a moto chega ao cliente e a modalidade do frete na nota. Nasce no
 * pedido, vai para a venda na efetivação e decide se a NF de saída é dentro ou fora do estado.
 */
import { lerDocumentoCliente } from '@/lib/documento'
import { ehModalidade, erroDoLocalDeEntrega, LIMITE_TEXTO_XML, MODALIDADE_INVALIDA, type LocalDeEntrega, type ModalidadeFrete } from './transporte'

/** O lugar da entrega como a NF exige (cidade = código IBGE), mais o nome da cidade só para a tela. */
export type EnderecoDaEntrega = Required<LocalDeEntrega> & { nomeCidade: string }
/** Outra pessoa que recebe a moto; nulo = o comprador, lido da venda na hora da NF. */
export type QuemRecebe = { nome: string; cpfCnpj: string }

export type EntregaVenda =
  | { modo: 'retira'; modalidade: ModalidadeFrete | '' }
  | { modo: 'entregar'; modalidade: ModalidadeFrete | ''; endereco: EnderecoDaEntrega; recebe: QuemRecebe | null }

/** Venda com Entrega e sem modalidade: o Novo pedido avisa e a NF não sai (#682). */
export const AVISO_SEM_MODALIDADE = 'Escolha a modalidade do frete. Sem ela a nota não sai.'

/** Pendência da prévia da NF: diz onde corrigir. A edição da Entrega na venda chega no #727. */
export const PENDENCIA_SEM_MODALIDADE = 'Falta a modalidade do frete na Entrega da venda. Corrija a Entrega na venda para a nota sair.'

/** O que a Entrega impede de emitir; venda antiga (sem Entrega) não exige modalidade. */
export const pendenciasDaEntrega = (entrega: EntregaVenda | null): string[] => (entrega && !entrega.modalidade ? [PENDENCIA_SEM_MODALIDADE] : [])

type Conferida<T> = { ok: true } & T | { ok: false; erro: string }

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

const enderecoLido = (dado: unknown): EnderecoDaEntrega => {
  const e = (dado ?? {}) as Record<string, unknown>
  return {
    cep: texto(e.cep).replace(/\D/g, ''), logradouro: texto(e.logradouro), numero: texto(e.numero),
    complemento: texto(e.complemento), bairro: texto(e.bairro), cidade: texto(e.cidade),
    nomeCidade: texto(e.nomeCidade), uf: texto(e.uf).toUpperCase(),
  }
}

/** Outra pessoa recebe: nome e CPF/CNPJ com a mesma conferência do comprador (ADR-0015). */
function conferirQuemRecebe(dado: unknown): Conferida<{ recebe: QuemRecebe | null }> {
  if (dado == null) return { ok: true, recebe: null }
  const r = dado as Record<string, unknown>
  const nome = texto(r.nome)
  if (!nome) return { ok: false, erro: 'Informe o nome de quem recebe.' }
  if (nome.length > LIMITE_TEXTO_XML) return { ok: false, erro: `O nome de quem recebe aceita no máximo ${LIMITE_TEXTO_XML} caracteres.` }
  const documento = lerDocumentoCliente(texto(r.cpfCnpj))
  if (!documento.ok) return documento
  return { ok: true, recebe: { nome, cpfCnpj: documento.documento } }
}

/** Confere a Entrega que veio do navegador e devolve só os campos que se gravam. */
export function conferirEntrega(dado: unknown): Conferida<{ entrega: EntregaVenda }> {
  const { modo, modalidade } = (dado ?? {}) as { modo?: unknown; modalidade?: unknown }
  if ((modo !== 'retira' && modo !== 'entregar') || typeof modalidade !== 'string') return { ok: false, erro: 'Escolha a entrega da venda.' }
  // Vazia grava: avise, não bloqueie. Quem barra a nota sem modalidade é a prévia da NF.
  if (modalidade !== '' && !ehModalidade(modalidade)) return { ok: false, erro: MODALIDADE_INVALIDA }
  if (modo === 'retira') return { ok: true, entrega: { modo, modalidade } }

  const { endereco: e, recebe: r } = dado as { endereco?: unknown; recebe?: unknown }
  const endereco = enderecoLido(e)
  const erro = erroDoLocalDeEntrega(endereco)
  if (erro) return { ok: false, erro }
  const recebe = conferirQuemRecebe(r)
  if (!recebe.ok) return recebe
  return { ok: true, entrega: { modo, modalidade, endereco, recebe: recebe.recebe } }
}

export type MotivoOperacao = 'retira' | 'retira_ciclomotor' | 'retira_contribuinte' | 'entregar' | 'sem_entrega'
export type OperacaoDaVenda = { interestadual: boolean; motivo: MotivoOperacao; ufOrigem: string; ufDestino: string }

type DadosDaOperacao = {
  /** Nula = venda anterior à Entrega (#725): vale a regra antiga. */
  entrega: EntregaVenda | null
  ufEmitente: string
  ufCliente: string
  /** Comprador com inscrição estadual (indicador "contribuinte"). */
  clienteContribuinte: boolean
  /** Moto que se emplaca: a mesma regra do RENAVE (`exigeRenave`). */
  ciclomotor: boolean
}

/**
 * Dentro ou fora do estado pela Entrega, não pela UF do cliente (#682, ADR-0021). Entregar vale a UF
 * do endereço de entrega comparada com a do emitente (#726). Retira na loja é
 * venda dentro do estado, salvo moto que se emplaca ou cliente com IE de outra UF, que o contador de
 * Teresina mandou sair como interestadual (05/11/2026). Prévia, payload e tela decidem por aqui.
 */
export function operacaoDaVenda(d: DadosDaOperacao): OperacaoDaVenda {
  const ufOrigem = d.ufEmitente.trim().toUpperCase()
  const ufCliente = d.ufCliente.trim().toUpperCase()
  const paraOCliente = (motivo: MotivoOperacao) => ({ interestadual: ufCliente !== ufOrigem, motivo, ufOrigem, ufDestino: ufCliente })
  if (!d.entrega) return paraOCliente('sem_entrega')
  if (d.entrega.modo === 'entregar') {
    const ufDestino = d.entrega.endereco.uf.trim().toUpperCase()
    return { interestadual: ufDestino !== ufOrigem, motivo: 'entregar', ufOrigem, ufDestino }
  }
  if (ufCliente !== ufOrigem && d.ciclomotor) return paraOCliente('retira_ciclomotor')
  if (ufCliente !== ufOrigem && d.clienteContribuinte) return paraOCliente('retira_contribuinte')
  return { interestadual: false, motivo: 'retira', ufOrigem, ufDestino: ufOrigem }
}

const PORQUE: Record<MotivoOperacao, string> = {
  retira: 'O cliente retira a moto na loja: vale a regra de dentro do estado.',
  retira_ciclomotor: 'O cliente retira na loja, mas a moto se emplaca no estado dele (ciclomotor): a venda é para outro estado.',
  retira_contribuinte: 'O cliente retira na loja, mas tem inscrição estadual em outro estado: a venda é para outro estado.',
  entregar: 'A loja entrega a moto: vale a UF do endereço de entrega.',
  sem_entrega: 'Esta venda não tem a Entrega informada: vale a UF do endereço do cliente. Confira antes de emitir.',
}

/** Selo e explicação da prévia da NF. */
export function textoDaOperacao(o: OperacaoDaVenda): { selo: string; porque: string } {
  const ufs = `(${o.ufOrigem} para ${o.ufDestino})`
  return { selo: o.interestadual ? `Para outro estado ${ufs}` : `Dentro do estado ${ufs}`, porque: PORQUE[o.motivo] }
}
