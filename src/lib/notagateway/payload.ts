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
 * A UF do cliente decide entre a operação interna e a interestadual, e não é só
 * o CFOP que muda: em MG a venda interna sai CST 60 (ST já recolhida pela
 * fábrica) e a interestadual sai CST 00 com ICMS destacado a 12%.
 */

import { ehCartao, type FormaPagamentoNfe } from './venda'

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
  }
  valor: number
  /** Já no vocabulário da API — ver `formaPagamentoNfe` em ./venda. */
  pagamentos: FormaPagamentoNfe[]
  informacoesAdicionais?: string
}

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
  impostos: ImpostosItem
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

  const interestadual = cliente.endereco.uf.toUpperCase() !== venda.ufEmitente.toUpperCase()

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
    const centavos = (v: number) => Math.round(v * 100) / 100
    const valorFederal = centavos((venda.valor * (federal ?? 0)) / 100)
    const valorEstadual = centavos((venda.valor * (estadual ?? 0)) / 100)
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
    valorUnitario: venda.valor,
    impostos,
  }
  if (moto.cest) item.cest = moto.cest

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
      indicadorContribuinteICMS: cliente.inscricaoEstadual ? 'Contribuinte' : 'NaoContribuinte',
      nome: cliente.nome,
      cpfCnpj: cliente.cpfCnpj.replace(/\D/g, ''),
      ...(cliente.email ? { email: cliente.email } : {}),
      ...(cliente.telefone ? { telefone: cliente.telefone.replace(/\D/g, '') } : {}),
      ...(cliente.inscricaoEstadual ? { inscricaoEstadual: cliente.inscricaoEstadual } : {}),
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
    informacoesAdicionais: venda.informacoesAdicionais ?? null,
  }
}
