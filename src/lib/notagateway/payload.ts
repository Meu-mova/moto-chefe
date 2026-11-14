/**
 * Monta o payload da NF-e de venda de moto para a API v2 da Nota Gateway.
 *
 * Três fontes se encontram aqui, e cada uma manda no que é dela:
 *
 * 1. **A ficha da moto** (`motos_fiscal`, copiada da nota de entrada) — NCM,
 *    CEST, unidade, origem e o **nome fiscal literal**. O mesmo modelo vem de
 *    CNPJs diferentes com classificação diferente, então isso é por moto e não
 *    por modelo. O nome sai exatamente como o fornecedor escreveu: decisão do
 *    Cesar, que considera errado o que o Bling fazia (padronizar para "X MOTO
 *    CHEFE").
 * 2. **A regra de saída do grupo** (`regras_fiscais_saida`) — CFOP, CST, PIS,
 *    COFINS e IBS/CBS. Não vem da entrada: `5405` é CFOP de entrada e a saída
 *    tem o seu. Foi extraída das ~200 notas que o grupo já emitiu pelo Bling e
 *    a SEFAZ aceitou.
 * 3. **A venda** — cliente, valor e formas de pagamento.
 *
 * A Entrega da venda decide entre a operação interna e a interestadual
 * (`operacaoDaVenda`, ADR-0021); venda sem Entrega segue a UF do cliente. Não é
 * só o CFOP que muda: em MG a venda interna sai CST 60 (ST já recolhida pela
 * fábrica) e a interestadual sai CST 00 com ICMS destacado a 12%.
 */

import { ehCartao, type FormaPagamentoNfe } from './venda'
import type { IndicadorIe } from '../documento'
import { operacaoExigeEntrega, type VeiculoNovo } from './veiculo'
import { validarDadosTransporte, type DadosTransporte, type EnderecoEntrega } from './transporte'
import { AVISO_SEM_MODALIDADE, freteDaVenda, modalidadeComFrete, valorDaMoto, operacaoDaVenda, transporteDaEntrega, type EntregaVenda } from './entrega'
import { centavos } from '@/lib/centavos'

export type RegraSaida = {
  naturezaOperacao: string
  cfopInterno: string
  cstIcmsInterno: string
  cfopInterestadual: string
  cstIcmsInterestadual: string
  aliquotaIcmsInterestadual: string | null
  cstPis: string
  aliquotaPis: string | null
  cstCofins: string
  aliquotaCofins: string | null
  cstIpi: string | null
  cstIbsCbs: string | null
  classTribIbsCbs: string | null
  crt: number
  /**
   * Preenchido = toda saída leva esta origem, que é o que o Bling faz hoje
   * (sempre 0). Nulo = usa a origem real da moto, vinda da nota de entrada.
   * Parametrizado porque está pendente de resposta do contador: moto que entrou
   * como importação direta (origem 1) pode sair como nacional?
   */
  origemFixa: string | null
  /**
   * Lei da Transparência: percentuais aproximados do IBPT. Com eles a API
   * escreve o "Valor aprox. dos Tributos" nas informações complementares, como
   * o Bling fazia. Nulos = a nota sai sem o total.
   */
  ibptFederal?: string | null
  ibptEstadual?: string | null
}

export type EnderecoCliente = {
  uf: string
  cidade: string
  logradouro: string
  numero: string
  complemento?: string
  bairro: string
  cep: string
}

export type DadosVendaMoto = {
  /** Id nosso, ecoado pela API — serve de chave de idempotência. */
  idExterno: string
  ambiente: 'Homologacao' | 'Producao'
  /** UF do emitente, para decidir operação interna x interestadual. */
  ufEmitente: string
  cliente: {
    tipoPessoa: 'F' | 'J'
    nome: string
    cpfCnpj: string
    email?: string
    telefone?: string
    inscricaoEstadual?: string
    /** Só comprador CNPJ; vazio conta como não contribuinte. */
    indicadorIe?: IndicadorIe | null
    endereco: EnderecoCliente
  }
  moto: {
    /** Nome fiscal literal da nota de entrada. */
    xProd: string
    codigo: string
    ncm: string
    cest: string
    unidade: string
    origem: string
    /** Grupo veicProd (RENAVE). Só ciclomotor — ver ./veiculo. */
    veiculo?: VeiculoNovo
    /** Moto que se emplaca (`exigeRenave`): retirada por cliente de outra UF sai interestadual. */
    ciclomotor: boolean
  }
  valor: number
  /** Já no vocabulário da API — ver `formaPagamentoNfe` em ./venda. */
  pagamentos: FormaPagamentoNfe[]
  informacoesAdicionais?: string
  transporte?: DadosTransporte
  /** Entrega da venda; nula ou ausente = venda anterior à Entrega, nota pela regra antiga. */
  entrega?: EntregaVenda | null
}

/** Dentro ou fora do estado desta nota: a prévia mostra o mesmo que o payload usa. */
export const operacaoDosDados = (venda: DadosVendaMoto) => operacaoDaVenda({
  entrega: venda.entrega ?? null,
  ufEmitente: venda.ufEmitente,
  ufCliente: venda.cliente.endereco.uf,
  clienteContribuinte: venda.cliente.indicadorIe === 'contribuinte',
  ciclomotor: venda.moto.ciclomotor,
})

export type ImpostosItem = {
  percentualAproximadoTributos?: {
    detalhado: {
      percentualFederal: number
      valorFederal: number
      percentualEstadual: number
      valorEstadual: number
      percentualMunicipal: number
      valorMunicipal: number
      valorTotal: number
    }
    fonte: string
  }
  icms: { situacaoTributaria: string; origem: number; aliquota?: number; baseCalculo?: number }
  // A alíquota vai dentro de `porAliquota` (confirmado pelo suporte em
  // 29/09/2026). Solta no objeto, a API ignora calada e o PIS sai 0%.
  pis: TributoPorAliquota
  cofins: TributoPorAliquota
  ipi?: TributoPorAliquota
  ibsCbs?: { situacaoTributaria?: string; classificacaoTributaria: string }
}

export type TributoPorAliquota = { situacaoTributaria: string; porAliquota?: { aliquota: number } }

export type ItemNfe = {
  cfop: string
  codigo: string
  descricao: string
  ncm: string
  /** Ausente quando o produto nao tem CEST -- string vazia a SEFAZ recusa. */
  cest?: string
  quantidade: number
  unidadeMedida: string
  valorUnitario: number
  /** Frete cobrado que está no total da nota (manual NG modelo 55, `itens[].frete`). */
  frete?: number
  impostos: ImpostosItem
  veiculoNovo?: VeiculoNovo
}

// Nomes da API v2, conferidos em homologação em 15/10/2026: 'ContribuinteIsento' é
// aceito sem erro, mas sai como não contribuinte (indIEDest 9); 'Isento' sai como 2.
const INDICADOR_NOTA_GATEWAY: Record<IndicadorIe, string> = {
  contribuinte: 'Contribuinte',
  isento: 'Isento',
  nao_contribuinte: 'NaoContribuinte',
}

const num = (v: string | null | undefined): number | undefined => {
  if (v === null || v === undefined || v === '') return undefined
  const n = Number(v)
  return Number.isFinite(n) ? n : undefined
}

/**
 * Origem da mercadoria na NOSSA nota a partir da origem da nota de entrada —
 * regra do contador (29/09/2026): 0 sai 0, 1 sai 2, 4 sai 4.
 *
 * A 1 vira 2 porque "importação direta" é de quem importou: na revenda a moto
 * é estrangeira adquirida no mercado interno. O resto passa igual, inclusive a
 * 2, que já é esse caso.
 */
export function origemDeSaida(origemEntrada: string | null | undefined): string {
  const o = (origemEntrada ?? '').trim() || '0'
  return o === '1' ? '2' : o
}

function porAliquota(cst: string, aliquota: string | null): TributoPorAliquota {
  const a = num(aliquota)
  return { situacaoTributaria: cst, ...(a !== undefined ? { porAliquota: { aliquota: a } } : {}) }
}

/** `transporte.enderecoEntrega` da NG; nome, complemento e CEP só quando houver (manual modelo 55: opcionais). */
const enderecoEntregaNg = (e: EnderecoEntrega) => ({
  tipoPessoaDestinatario: e.tipoPessoaDestinatario,
  cpfCnpjDestinatario: e.cpfCnpjDestinatario,
  ...(e.nomeDestinatario ? { nomeDestinatario: e.nomeDestinatario } : {}),
  pais: null,
  logradouro: e.logradouro,
  numero: e.numero,
  ...(e.complemento ? { complemento: e.complemento } : {}),
  bairro: e.bairro,
  cidade: e.cidade,
  uf: e.uf,
  ...(e.cep ? { cep: e.cep } : {}),
})

export function montarNfeVendaMoto(venda: DadosVendaMoto, regra: RegraSaida) {
  const { moto, cliente } = venda

  // Sem NCM não há nota. Falhar aqui é melhor que a SEFAZ rejeitar depois, e é
  // o que faz a tela pedir a conferência humana para moto sem ficha.
  if (!moto.ncm) {
    throw new Error(`Moto sem ficha fiscal (NCM) — confira a nota de entrada antes de emitir`)
  }

  const somaPagamentos = venda.pagamentos.reduce((s, p) => s + p.valor, 0)
  if (Math.abs(somaPagamentos - venda.valor) > 0.01) {
    throw new Error(
      `A soma dos pagamentos (${somaPagamentos.toFixed(2)}) não fecha com o valor da venda (${venda.valor.toFixed(2)})`,
    )
  }

  // Faturamento direto (tpOp 2): o transporte do formulário da nota (#650). Fora dele, "Entregar" leva o
  // endereço de entrega da venda (#726); sem modalidade, cai na recusa de baixo, como a retirada.
  const entregar = venda.entrega?.modo === 'entregar' && venda.entrega.modalidade ? venda.entrega : null
  const transporteValidado = operacaoExigeEntrega(moto.veiculo?.tipoOperacao) ? validarDadosTransporte(venda.transporte)
    : entregar ? validarDadosTransporte(transporteDaEntrega(entregar, cliente)) : null
  if (transporteValidado && !transporteValidado.ok) throw new Error(transporteValidado.erro)

  // Retira na loja manda só a modalidade, sem enderecoEntrega.
  const freteDaEntrega = !transporteValidado && venda.entrega ? venda.entrega.modalidade : null
  if (freteDaEntrega === '') throw new Error(AVISO_SEM_MODALIDADE)

  const { interestadual } = operacaoDosDados(venda)
  // O frete cobrado está somado no valor da venda: na nota, a moto vale o resto e o frete vai no item (W16-10: vNF soma vFrete).
  // Só quando a modalidade que vai na nota é da loja: no faturamento direto ela vem do formulário (#728).
  const modalidadeDaNota = transporteValidado?.ok ? transporteValidado.dados.modalidade : venda.entrega?.modalidade ?? ''
  const frete = modalidadeComFrete(modalidadeDaNota) ? freteDaVenda(venda.entrega ?? null) : 0
  // Pendente (Cesar/contador, #726): o valor aproximado dos tributos sai sobre o total com frete; trocar para `valorDaMoto(venda.valor, frete)` aqui.
  const valorDoIbpt = venda.valor

  const icms: ImpostosItem['icms'] = {
    situacaoTributaria: interestadual ? regra.cstIcmsInterestadual : regra.cstIcmsInterno,
    origem: Number(regra.origemFixa ?? origemDeSaida(moto.origem)),
  }
  if (interestadual) {
    const aliq = num(regra.aliquotaIcmsInterestadual)
    if (aliq !== undefined) {
      icms.aliquota = aliq
      icms.baseCalculo = venda.valor
    }
  }

  const impostos: ImpostosItem = {
    icms,
    pis: porAliquota(regra.cstPis, regra.aliquotaPis),
    cofins: porAliquota(regra.cstCofins, regra.aliquotaCofins),
  }
  // O Bling manda o IPI CST 99 zerado; sem CST na regra, o bloco fica de fora.
  if (regra.cstIpi) impostos.ipi = porAliquota(regra.cstIpi, '0')
  const federal = num(regra.ibptFederal)
  const estadual = num(regra.ibptEstadual)
  if (federal !== undefined || estadual !== undefined) {
    const valorFederal = centavos((valorDoIbpt * (federal ?? 0)) / 100)
    const valorEstadual = centavos((valorDoIbpt * (estadual ?? 0)) / 100)
    impostos.percentualAproximadoTributos = {
      detalhado: {
        percentualFederal: federal ?? 0,
        valorFederal,
        percentualEstadual: estadual ?? 0,
        valorEstadual,
        percentualMunicipal: 0,
        valorMunicipal: 0,
        valorTotal: centavos(valorFederal + valorEstadual),
      },
      fonte: 'IBPT',
    }
  }
  if (regra.classTribIbsCbs) {
    impostos.ibsCbs = {
      ...(regra.cstIbsCbs ? { situacaoTributaria: regra.cstIbsCbs } : {}),
      classificacaoTributaria: regra.classTribIbsCbs,
    }
  }

  // Campo vazio não vai como string vazia: a SEFAZ recusa CEST em branco, e a
  // API repassa o que a gente mandar.
  const item: ItemNfe = {
    cfop: interestadual ? regra.cfopInterestadual : regra.cfopInterno,
    codigo: moto.codigo || moto.xProd,
    descricao: moto.xProd,
    ncm: moto.ncm,
    quantidade: 1,
    unidadeMedida: moto.unidade || 'UN',
    valorUnitario: valorDaMoto(venda.valor, frete),
    ...(frete ? { frete } : {}),
    impostos,
  }
  if (moto.cest) item.cest = moto.cest
  if (moto.veiculo) item.veiculoNovo = moto.veiculo

  return {
    id: venda.idExterno,
    ambienteEmissao: venda.ambiente,
    naturezaOperacao: regra.naturezaOperacao,
    tipoOperacao: 'Saida' as const,
    finalidade: 'Normal' as const,
    consumidorFinal: true,
    // Nota de teste nunca vai para o e-mail do cliente — o destinatário é real.
    enviarPorEmail: venda.ambiente === 'Producao' && !!cliente.email,
    pedido: {
      presencaConsumidor: 'OperacaoPresencial',
      pagamento: {
        formas: venda.pagamentos.map(p => ({
          tipo: p.tipo,
          valor: p.valor,
          ...(p.descricao ? { descricao: p.descricao } : {}),
          // Cartão exige o grupo do credenciador; a maquininha não é integrada
          // ao MOVA, então vai só o tipo de integração (tpIntegra 2).
          ...(ehCartao(p.tipo) ? { credenciadoraCartao: { tipoIntegracaoPagamento: 'NaoIntegradoAoSistemaDeGestao' } } : {}),
        })),
      },
    },
    cliente: {
      tipoPessoa: cliente.tipoPessoa,
      indicadorContribuinteICMS: INDICADOR_NOTA_GATEWAY[cliente.indicadorIe ?? 'nao_contribuinte'],
      nome: cliente.nome,
      cpfCnpj: cliente.cpfCnpj.replace(/\D/g, ''),
      ...(cliente.email ? { email: cliente.email } : {}),
      ...(cliente.telefone ? { telefone: cliente.telefone.replace(/\D/g, '') } : {}),
      ...(cliente.indicadorIe === 'contribuinte' && cliente.inscricaoEstadual ? { inscricaoEstadual: cliente.inscricaoEstadual } : {}),
      endereco: {
        uf: cliente.endereco.uf,
        cidade: cliente.endereco.cidade,
        logradouro: cliente.endereco.logradouro,
        numero: cliente.endereco.numero,
        ...(cliente.endereco.complemento ? { complemento: cliente.endereco.complemento } : {}),
        bairro: cliente.endereco.bairro,
        cep: cliente.endereco.cep.replace(/\D/g, ''),
      },
    },
    itens: [item],
    ...(transporteValidado?.ok ? { transporte: {
      frete: { modalidade: transporteValidado.dados.modalidade },
      enderecoEntrega: enderecoEntregaNg(transporteValidado.dados.enderecoEntrega!),
    } } : {}),
    ...(freteDaEntrega ? { transporte: { frete: { modalidade: freteDaEntrega } } } : {}),
    informacoesAdicionais: venda.informacoesAdicionais ?? null,
  }
}
