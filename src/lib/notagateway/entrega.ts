/**
 * Entrega da venda (#682): onde a moto chega ao cliente e a modalidade do frete na nota. Nasce no
 * pedido, vai para a venda na efetivação e decide se a NF de saída é dentro ou fora do estado.
 */
import { lerDocumentoCliente } from '@/lib/documento'
import { tipoPessoa } from './venda'
import { ehModalidade, erroDoLocalDeEntrega, LIMITE_TEXTO_XML, MODALIDADE_INVALIDA, NOME_DE_QUEM_RECEBE_LONGO, type DadosTransporte, type LocalDeEntrega, type ModalidadeFrete } from './transporte'

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

export const UF_DO_FORMULARIO_DIFERENTE = 'A UF da entrega no formulário da nota é diferente da Entrega da venda. Corrija antes de emitir.'

/**
 * Faturamento direto de venda "Entregar": até a #728 o endereço de entrega sai do formulário da nota, e a
 * operação sai da Entrega. UFs diferentes dariam nota que não bate com o local de entrega (decisão do Luis,
 * 07/11/2026). Tela e transmitir decidem por aqui.
 */
export function conflitoDaUfDoFormulario(entrega: EntregaVenda | null, formulario: DadosTransporte | undefined): string | null {
  const uf = formulario?.enderecoEntrega?.uf.trim().toUpperCase()
  return entrega?.modo === 'entregar' && uf && uf !== entrega.endereco.uf ? UF_DO_FORMULARIO_DIFERENTE : null
}

const NOME_DO_CLIENTE_LONGO = `O nome do cliente passa de ${LIMITE_TEXTO_XML} caracteres, o limite da nota para quem recebe a entrega. Corrija o nome do cliente antes de emitir.`

/**
 * O que a Entrega impede de emitir; venda antiga (sem Entrega) não exige modalidade. Comprador que recebe
 * a entrega vai como `nomeDestinatario`, que a NF limita a 60 caracteres.
 */
export const pendenciasDaEntrega = (entrega: EntregaVenda | null, nomeDoComprador: string): string[] => [
  ...(entrega && !entrega.modalidade ? [PENDENCIA_SEM_MODALIDADE] : []),
  ...(entrega?.modo === 'entregar' && !entrega.recebe && nomeDoComprador.trim().length > LIMITE_TEXTO_XML ? [NOME_DO_CLIENTE_LONGO] : []),
]

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

/** Outra pessoa recebe: nome e CPF/CNPJ com a mesma conferência do comprador (ADR-0015). Tela e servidor. */
export function conferirQuemRecebe(dado: unknown): Conferida<{ recebe: QuemRecebe | null }> {
  if (dado == null) return { ok: true, recebe: null }
  const r = dado as Record<string, unknown>
  const nome = texto(r.nome)
  if (!nome) return { ok: false, erro: 'Informe o nome de quem recebe.' }
  if (nome.length > LIMITE_TEXTO_XML) return { ok: false, erro: NOME_DE_QUEM_RECEBE_LONGO }
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
    ?? (endereco.nomeCidade.length > LIMITE_TEXTO_XML ? `A cidade da entrega aceita no máximo ${LIMITE_TEXTO_XML} caracteres.` : null)
  if (erro) return { ok: false, erro }
  const recebe = conferirQuemRecebe(r)
  if (!recebe.ok) return recebe
  return { ok: true, entrega: { modo, modalidade, endereco, recebe: recebe.recebe } }
}

/** O transporte da NF para "Entregar": quem recebe vazio é o comprador da venda (#726). */
export function transporteDaEntrega(
  entrega: Extract<EntregaVenda, { modo: 'entregar' }>,
  comprador: { nome: string; cpfCnpj: string },
): DadosTransporte {
  const quem = entrega.recebe ?? comprador
  const { logradouro, numero, complemento, bairro, cidade, uf, cep } = entrega.endereco
  return {
    modalidade: entrega.modalidade,
    enderecoEntrega: {
      tipoPessoaDestinatario: tipoPessoa(quem.cpfCnpj), cpfCnpjDestinatario: quem.cpfCnpj, nomeDestinatario: quem.nome,
      logradouro, numero, bairro, cidade, uf, ...(complemento ? { complemento } : {}), ...(cep ? { cep } : {}),
    },
  }
}

export type MotivoOperacao =
  | 'retira' | 'retira_ciclomotor' | 'retira_contribuinte' | 'entregar' | 'entregar_ciclomotor' | 'entregar_contribuinte' | 'sem_entrega'
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
 * Dentro ou fora do estado pela Entrega, não pela UF do cliente (#682, ADR-0021). Entregar em outra UF
 * é para outro estado (#726). Retirada ou entrega na UF da loja é dentro do estado, salvo moto que se
 * emplaca ou cliente com IE de outra UF, que o contador de Teresina mandou sair como interestadual
 * (05/11/2026; o Luis estendeu à entrega em 07/11/2026). Prévia, payload e tela decidem por aqui.
 */
export function operacaoDaVenda(d: DadosDaOperacao): OperacaoDaVenda {
  const ufOrigem = d.ufEmitente.trim().toUpperCase()
  const ufCliente = d.ufCliente.trim().toUpperCase()
  const paraOCliente = (motivo: MotivoOperacao) => ({ interestadual: ufCliente !== ufOrigem, motivo, ufOrigem, ufDestino: ufCliente })
  if (!d.entrega) return paraOCliente('sem_entrega')
  const entregar = d.entrega.modo === 'entregar'
  const ufEntrega = d.entrega.modo === 'entregar' ? d.entrega.endereco.uf.trim().toUpperCase() : ufOrigem
  if (ufEntrega !== ufOrigem) return { interestadual: true, motivo: 'entregar', ufOrigem, ufDestino: ufEntrega }
  // A moto fica na UF da loja (retirada ou entrega lá): as exceções do contador valem para os dois modos.
  if (ufCliente !== ufOrigem && d.ciclomotor) return paraOCliente(entregar ? 'entregar_ciclomotor' : 'retira_ciclomotor')
  if (ufCliente !== ufOrigem && d.clienteContribuinte) return paraOCliente(entregar ? 'entregar_contribuinte' : 'retira_contribuinte')
  return { interestadual: false, motivo: entregar ? 'entregar' : 'retira', ufOrigem, ufDestino: ufOrigem }
}

const PORQUE: Record<MotivoOperacao, string> = {
  retira: 'O cliente retira a moto na loja: vale a regra de dentro do estado.',
  retira_ciclomotor: 'O cliente retira na loja, mas a moto se emplaca no estado dele (ciclomotor): a venda é para outro estado.',
  retira_contribuinte: 'O cliente retira na loja, mas tem inscrição estadual em outro estado: a venda é para outro estado.',
  entregar: 'A loja entrega a moto: vale a UF do endereço de entrega.',
  entregar_ciclomotor: 'A loja entrega no estado dela, mas a moto se emplaca no estado do cliente (ciclomotor): a venda é para outro estado.',
  entregar_contribuinte: 'A loja entrega no estado dela, mas o cliente tem inscrição estadual em outro estado: a venda é para outro estado.',
  sem_entrega: 'Esta venda não tem a Entrega informada: vale a UF do endereço do cliente. Confira antes de emitir.',
}

/** Selo e explicação da prévia da NF. */
export function textoDaOperacao(o: OperacaoDaVenda): { selo: string; porque: string } {
  const ufs = `(${o.ufOrigem} para ${o.ufDestino})`
  return { selo: o.interestadual ? `Para outro estado ${ufs}` : `Dentro do estado ${ufs}`, porque: PORQUE[o.motivo] }
}
