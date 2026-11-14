/**
 * Entrega da venda (#682): onde a moto chega ao cliente e a modalidade do frete na nota. Nasce no
 * pedido, vai para a venda na efetivação e decide se a NF de saída é dentro ou fora do estado.
 */
import { lerDocumentoCliente } from '@/lib/documento'
import { mascaraCep } from '@/lib/mascaras'
import { brl } from '@/lib/dashboard-painel'
import { centavos } from '@/lib/numero-br'
import { tipoPessoa } from './venda'
import { travaDoCancelamentoDaVenda, type TravaDoCancelamento } from './status'
import { ehModalidade, erroDoLocalDeEntrega, textoDaModalidade, LIMITE_TEXTO_XML, MODALIDADE_INVALIDA, NOME_DE_QUEM_RECEBE_LONGO, type DadosTransporte, type LocalDeEntrega, type ModalidadeFrete } from './transporte'

/** O lugar da entrega como a NF exige (cidade = código IBGE), mais o nome da cidade só para a tela. */
export type EnderecoDaEntrega = Required<LocalDeEntrega> & { nomeCidade: string }
/** Outra pessoa que recebe a moto; nulo = o comprador, lido da venda na hora da NF. */
export type QuemRecebe = { nome: string; cpfCnpj: string }

export type EntregaVenda =
  | { modo: 'retira'; modalidade: ModalidadeFrete | '' }
  | {
    modo: 'entregar'; modalidade: ModalidadeFrete | ''; endereco: EnderecoDaEntrega; recebe: QuemRecebe | null
    /** Frete cobrado do cliente, em reais; ausente = sem frete. Está somado em `vendas.valor` (#726, #796). */
    frete?: number
  }

/** Modalidades em que a loja faz o frete: só nelas o frete cobrado existe e vai na nota (decisão do Luis, 07/11/2026). */
const MODALIDADES_COM_FRETE: readonly ModalidadeFrete[] = ['TransporteProprioPorContaDoRemetente', 'ContratacaoPorContaDoRemetente']
export const modalidadeComFrete = (m: ModalidadeFrete | '') => (MODALIDADES_COM_FRETE as readonly string[]).includes(m)

/** Frete cobrado gravado na Entrega (zero sem frete, na retirada e em venda antiga). */
export const freteDaVenda = (entrega: EntregaVenda | null): number => (entrega?.modo === 'entregar' ? entrega.frete ?? 0 : 0)

/**
 * Valor da venda = moto + frete cobrado (#726). A mesma conta na tela, na efetivação e no editar venda. Sem piso:
 * abaixo do frete é pendência da NF e item moto sem valor (`motoNaNota`). Os relatórios (#796) têm regra própria, com piso 0
 * (`valorDaMotoNosRelatoriosExpr` em `src/lib/queries/valor-liquido.ts`).
 */
export const totalComFrete = (valorDaMoto: number, frete: number): number => centavos(valorDaMoto + frete)
export const valorDaMoto = (valorDaVenda: number, frete: number): number => centavos(valorDaVenda - frete)
/** A moto na nota e no item do pedido; nulo quando o valor da venda não cobre o frete (pendência da NF, tela e item sem valor). */
export const motoNaNota = (valorDaVenda: number, frete: number): number | null => {
  const moto = valorDaMoto(valorDaVenda, frete)
  return moto > 0 ? moto : null
}

const SO_FRETE_DA_LOJA = `O frete cobrado só vale com ${MODALIDADES_COM_FRETE.map(m => `"${textoDaModalidade(m)}"`).join(' ou ')}.`

function conferirFrete(frete: unknown, modalidade: ModalidadeFrete | ''): Conferida<{ frete: number | null }> {
  if (frete == null) return { ok: true, frete: null }
  if (!modalidadeComFrete(modalidade)) return { ok: false, erro: SO_FRETE_DA_LOJA }
  const emReais = typeof frete === 'number' && Number.isFinite(frete) && frete > 0 && centavos(frete) === frete
  return emReais ? { ok: true, frete } : { ok: false, erro: 'Valor do frete inválido.' }
}

/** Como a Entrega aparece no resumo do pedido e na efetivação. */
export const textoDaEntrega = (entrega: EntregaVenda): string => {
  if (entrega.modo === 'retira') return 'Retira na loja'
  const { nomeCidade, cidade, uf } = entrega.endereco
  const lugar = nomeCidade || cidade
  return uf && lugar ? `Entregar em ${lugar}/${uf}` : 'Entregar'
}

/** Endereço da entrega numa linha (efetivação): só o que foi preenchido. */
export const enderecoDaEntregaEmLinha = (e: EnderecoDaEntrega): string => [
  e.logradouro, e.numero, e.complemento, e.bairro, `${e.nomeCidade || e.cidade}/${e.uf}`,
  e.cep ? `CEP ${mascaraCep(e.cep)}` : '',
].filter(Boolean).join(', ')

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

export const ENTREGA_EM_OUTRO_ESTADO = 'Entrega para outro estado ainda não disponível. Use Retira na loja ou entrega no mesmo estado.'

/**
 * Trava provisória da entrega em outra UF (#848): a SEFAZ recusa com 732 o caso que a NG ainda analisa, e a
 * moto importada depende da #724. Sai num PR próprio quando os dois se resolverem. UF do emitente
 * desconhecida (grupo sem NG, NG fora do ar) não trava: no pedido, avise, não bloqueie; a emissão já exige a UF.
 */
export function travaDaEntregaEmOutroEstado(entrega: EntregaVenda | null, ufEmitente: string | null): string | null {
  return ufEmitente && entregaEmOutraUf(entrega, ufEmitente) ? ENTREGA_EM_OUTRO_ESTADO : null
}

const siglaUf = (uf: string) => uf.trim().toUpperCase()

/** "Entregar" fora da UF do emitente. A trava (#848) e a operação da NF decidem por aqui, para não divergirem. */
export const entregaEmOutraUf = (entrega: EntregaVenda | null, ufEmitente: string): boolean =>
  entrega?.modo === 'entregar' && siglaUf(entrega.endereco.uf) !== siglaUf(ufEmitente)

const NOME_DO_CLIENTE_LONGO = `O nome do cliente passa de ${LIMITE_TEXTO_XML} caracteres, o limite da nota para quem recebe a entrega. Corrija o nome do cliente antes de emitir.`

/**
 * O que a Entrega impede de emitir; venda antiga (sem Entrega) não exige modalidade. Comprador que recebe
 * a entrega vai como `nomeDestinatario`, que a NF limita a 60 caracteres. O frete sai do valor da venda:
 * venda editada para menos que o frete deixaria a moto sem valor na nota.
 */
export function pendenciasDaEntrega(entrega: EntregaVenda | null, nomeDoComprador: string, valorDaVenda: number): string[] {
  const frete = freteDaVenda(entrega)
  return [
    ...(entrega && !entrega.modalidade ? [PENDENCIA_SEM_MODALIDADE] : []),
    ...(entrega?.modo === 'entregar' && !entrega.recebe && nomeDoComprador.trim().length > LIMITE_TEXTO_XML ? [NOME_DO_CLIENTE_LONGO] : []),
    ...(frete && motoNaNota(valorDaVenda, frete) === null
      ? [`O valor da venda não cobre o frete cobrado (${brl(frete)}). Corrija em Editar venda: o valor da venda inclui o frete.`] : []),
  ]
}

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
  const frete = conferirFrete((dado as { frete?: unknown }).frete, modalidade)
  if (!frete.ok) return frete
  return { ok: true, entrega: { modo, modalidade, endereco, recebe: recebe.recebe, ...(frete.frete ? { frete: frete.frete } : {}) } }
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
  const ufOrigem = siglaUf(d.ufEmitente)
  const ufCliente = siglaUf(d.ufCliente)
  const paraOCliente = (motivo: MotivoOperacao) => ({ interestadual: ufCliente !== ufOrigem, motivo, ufOrigem, ufDestino: ufCliente })
  if (!d.entrega) return paraOCliente('sem_entrega')
  const entregar = d.entrega.modo === 'entregar'
  if (d.entrega.modo === 'entregar' && entregaEmOutraUf(d.entrega, ufOrigem)) {
    return { interestadual: true, motivo: 'entregar', ufOrigem, ufDestino: siglaUf(d.entrega.endereco.uf) }
  }
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

/** Alterar a Entrega (#895) com NF de produção autorizada na venda (decisão do Luis, #727). */
export const CANCELE_A_NF_PARA_ALTERAR = 'Cancele a NF antes de mudar a entrega.'

/** O que fazer em cada situação da nota viva que trava o Alterar, como no "Cancelar venda". */
export const TRAVA_DO_ALTERAR: Record<TravaDoCancelamento, string> = {
  cancelar_nf: CANCELE_A_NF_PARA_ALTERAR,
  tentar_de_novo: CANCELE_A_NF_PARA_ALTERAR,
  emissao_em_andamento: 'Há uma NF de saída em emissão para esta venda. Espere ela terminar ou descarte a tentativa pelo botão "NF Saída"; depois, mude a entrega.',
  cancelamento_em_andamento: 'O cancelamento da NF está em andamento na SEFAZ. Mude a entrega depois que ele terminar.',
  fora_do_prazo: 'A NF passou do prazo de 24h para cancelar: o caminho é o cancelamento extemporâneo, pedido pela contabilidade. Com a NF cancelada, mude a entrega.',
  sem_data: 'Não deu para confirmar o prazo de cancelamento da NF. Abra a NF pelo número dela e consulte; depois, tente de novo.',
}

/**
 * Trava do Alterar: a regra do "Cancelar venda" (ADR-0014, `travaDoCancelamentoDaVenda`). Só a nota de produção
 * viva trava; homologação, recusada e cancelada liberam. A tela e o servidor decidem por esta função.
 */
export function travaDaAlteracaoDaEntrega<N extends { ambiente: string; status: string; dataAutorizacao: string | null }>(notas: N[], agora: Date): string | null {
  const r = travaDoCancelamentoDaVenda(notas, agora)
  return r && TRAVA_DO_ALTERAR[r.trava]
}
/** O pedido em aprovação já guardou o frete nos dados da aprovação: mudar agora os descasaria. */
export const PEDIDO_EM_APROVACAO_PARA_ALTERAR = 'Pedido aguardando aprovação: recuse ou aprove antes de mudar a entrega.'
export const FRETE_FIXO_NA_VENDA = 'O frete cobrado não muda depois da venda: mantenha "Entregar", com a loja levando ou contratando, e o mesmo valor.'
export const SEM_FRETE_NA_VENDA = 'A venda não tem frete cobrado, e o frete não entra depois da venda.'

/**
 * Na venda já efetivada o frete cobrado está no total e nos pagamentos (decisão do Luis, #727 Q3): com frete, só
 * muda o resto, mantendo "Entregar", modalidade com frete e o mesmo valor em centavos; sem frete, não ganha.
 */
export function recusaDoFreteDaVendaEfetivada(antes: EntregaVenda | null, depois: EntregaVenda): string | null {
  const frete = freteDaVenda(antes)
  if (!frete) return freteDaVenda(depois) ? SEM_FRETE_NA_VENDA : null
  const mantem = depois.modo === 'entregar' && modalidadeComFrete(depois.modalidade) && centavos(freteDaVenda(depois)) === centavos(frete)
  return mantem ? null : FRETE_FIXO_NA_VENDA
}

/** O que o log de ações guarda de cada lado da alteração (sem endereço nem documento de quem recebe). */
export const entregaParaLog = (e: EntregaVenda | null) =>
  e && { modo: e.modo, uf: e.modo === 'entregar' ? e.endereco.uf : null, modalidade: e.modalidade, frete: freteDaVenda(e) }
