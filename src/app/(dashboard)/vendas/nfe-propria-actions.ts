'use server'
import { db } from '@/lib/db'
import { motos, modelos, motosFiscal, vendas, regrasFiscaisSaida, notasFiscaisSaida, usuarios } from '@/lib/db/schema'
import { and, desc, eq, notInArray, sql, type SQL } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { registrarAcaoSensivelSemFalhar } from '@/lib/log-acoes'
import { getGrupoIdDaLoja, podeUsuarioVerGrupo } from '@/lib/grupo'
import { situacaoNfDaVenda } from '@/lib/assinatura/consulta'
import { motivoBloqueioNf } from '@/lib/assinatura/nf'
import { normalizarCest } from '@/lib/nfe-fiscal'
import { observacoesVendaMoto } from '@/lib/nfe-observacoes'
import { montarNfeVendaMoto, type DadosVendaMoto, type RegraSaida } from '@/lib/notagateway/payload'
import { formaPagamentoNfe, idExternoNfe, pendenciasDaVenda, tipoPessoa, type PagamentoMova } from '@/lib/notagateway/venda'
import { escolherTentativa, gravarEnvio, registrarEnvio } from '@/lib/notagateway/tentativa'
import { cancelarNfe, configNotaGateway, consultarNfe, enviarNfe, ufDaEmpresa, CancelamentoRecusado, NfeRecusada, type ConfigNotaGateway, type NfeConsultada } from '@/lib/notagateway/client'
import { podeOperarNfSaida } from './papeis-nf-saida'
import { STATUS_MORTOS, cancelamentoConcluido, efeitoNaVenda, ehFinal, ehRecusada, emCancelamento, limiteCancelamento, MINUTOS_PARA_DESCARTAR, motivoDoStatus, normalizarContador, podeCancelarExtemporaneo, podeDescartarTentativa, situacaoCancelamento, travaDoCancelamentoDaVenda, type SituacaoCancelamento, type TravaDoCancelamento } from '@/lib/notagateway/status'
import { diaEHoraBrt } from '@/lib/data-venda'
import { espera } from '@/lib/espera'
import { divergenciaDeAmbiente } from '@/lib/notagateway/ambiente'
import { travaDoPapel } from '@/lib/cancelar-venda'
import { isIndicadorIe } from '@/lib/documento'
import { gravarCorrecaoDaNf, type CorrecaoNf } from '@/lib/notagateway/correcao'

// Mesma lista de admin/notas-fiscais/actions.ts.
const PAPEIS_CONFIG_FISCAL = ['admin_geral', 'admin_socio']

/**
 * NF-e de venda de moto emitida pelo próprio MOVA (Nota Gateway).
 *
 * Fluxo da tela: pré-visualiza → confere → transmite. Nunca num clique só — a
 * conferência humana que o Bling dava continua. A trava do contrato assinado
 * vale igual aos outros caminhos de NF.
 *
 * Homologação emite de verdade na SEFAZ de teste, mas NUNCA fatura a venda:
 * serve para conferir a nota sem valor fiscal.
 */

async function exigirPapel(acao = 'emitir') {
  const u = await getUsuarioLogado()
  if (!podeOperarNfSaida(u.papel)) throw new Error(`Sem permissão para ${acao} NF de saída`)
  return u
}

export type NotaResumo = {
  id: string
  ambiente: string
  status: string
  motivoStatus: string | null
  numero: string | null
  serie: string | null
  linkDanfe: string | null
  linkXml: string | null
  criadoEm: string
  dataAutorizacao: string | null
  /** O último pedido de cancelamento, ou o descarte da tentativa: nosso motivo, quem pediu e quando. */
  cancelamento: { motivo: string; por: string | null; em: string; contador: string | null } | null
}

export type FichaMoto = { xProd: string; ncm: string; cest: string; unidade: string; origem: string }

export type PreviaNfe =
  | { ok: false; error: string }
  | {
      ok: true
      vendaId: string
      ambiente: 'Homologacao' | 'Producao'
      jaFaturada: string | null
      pendencias: string[]
      /** Nulo = moto sem ficha fiscal; `sugestao` pré-preenche o formulário. */
      ficha: FichaMoto | null
      sugestao: FichaMoto
      resumo: {
        cliente: { nome: string; documento: string; endereco: string; email: string | null }
        produto: { descricao: string; ncm: string; cest: string; cfop: string; cst: string; origemEntrada: string; origemSaida: string }
        valor: number
        pagamentos: { tipo: string; valor: number }[]
        tributos: { pis: string; cofins: string; aproximado: number | null }
        observacao: string
        interestadual: boolean
      } | null
      notas: NotaResumo[]
      /** Valores atuais do cadastro, para corrigir a nota recusada (#347). */
      correcao: Required<CorrecaoNf>
      /** Só Admin Geral e Sócio gravam a configuração fiscal do grupo. */
      podeConfigurarFiscal: boolean
    }

const numOuNulo = (v: string | null) => (v == null ? null : v)

/** Junta tudo o que a nota precisa. Pré-visualização e transmissão usam a MESMA montagem. */
async function montarEmissao(motoId: string, usuario: Usuario) {
  const [venda] = await db
    .select()
    .from(vendas)
    .where(eq(vendas.motoId, motoId))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)
  if (!venda) throw new Error('Nenhuma venda encontrada para esta moto')

  const grupoId = await getGrupoIdDaLoja(venda.lojaId)
  await exigirGrupo(usuario, grupoId)
  const cfg = await configNotaGateway(grupoId)
  if (!cfg) throw new Error('Emissão pelo MOVA não configurada para este grupo — veja Admin → Notas fiscais')

  const [moto] = await db
    .select({ chassi: motos.chassi, cor: motos.cor, motor: motos.motor, modeloId: motos.modeloId })
    .from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  const [modelo] = await db
    .select({ marca: modelos.marca, modelo: modelos.modelo, categoria: modelos.categoria, potenciaW: modelos.potenciaW, motor: modelos.motor })
    .from(modelos).where(eq(modelos.id, moto.modeloId)).limit(1)

  const [ficha] = await db.select().from(motosFiscal).where(eq(motosFiscal.motoId, motoId)).limit(1)
  const [regraRow] = await db.select().from(regrasFiscaisSaida).where(eq(regrasFiscaisSaida.grupoId, grupoId)).limit(1)

  const pagamentosMova = ((venda.pagamentos as PagamentoMova[] | null) ?? []).map(p => ({ ...p, valor: Number(p.valor) }))
  const valor = Number(venda.valor)

  const pendencias = pendenciasDaVenda({
    clienteNome: venda.clienteNome, clienteCpf: venda.clienteCpf,
    clienteLogradouro: venda.clienteLogradouro, clienteNumero: venda.clienteNumero,
    clienteBairro: venda.clienteBairro, clienteCidade: venda.clienteCidade,
    clienteEstado: venda.clienteEstado, clienteCep: venda.clienteCep,
    clienteIndicadorIe: venda.clienteIndicadorIe, clienteInscricaoEstadual: venda.clienteInscricaoEstadual,
    valor, pagamentos: pagamentosMova, temFicha: !!ficha,
  })
  if (!regraRow) pendencias.push('Regra fiscal de saída do grupo não cadastrada — Admin → Notas fiscais')

  const regra: RegraSaida | null = regraRow
    ? {
        naturezaOperacao: regraRow.naturezaOperacao,
        cfopInterno: regraRow.cfopInterno,
        cstIcmsInterno: regraRow.cstIcmsInterno,
        cfopInterestadual: regraRow.cfopInterestadual,
        cstIcmsInterestadual: regraRow.cstIcmsInterestadual,
        aliquotaIcmsInterestadual: numOuNulo(regraRow.aliquotaIcmsInterestadual),
        cstPis: regraRow.cstPis,
        aliquotaPis: numOuNulo(regraRow.aliquotaPis),
        cstCofins: regraRow.cstCofins,
        aliquotaCofins: numOuNulo(regraRow.aliquotaCofins),
        cstIpi: regraRow.cstIpi,
        cstIbsCbs: regraRow.cstIbsCbs,
        classTribIbsCbs: regraRow.classTribIbsCbs,
        crt: regraRow.crt,
        origemFixa: regraRow.origemFixa,
        ibptFederal: numOuNulo(regraRow.ibptFederal),
        ibptEstadual: numOuNulo(regraRow.ibptEstadual),
      }
    : null

  const observacao = observacoesVendaMoto({
    marca: modelo?.marca ?? null,
    modeloNome: modelo?.modelo ?? null,
    chassi: moto.chassi,
    motor: moto.motor,
    tipoMotor: modelo?.motor ?? null,
    categoria: modelo?.categoria ?? null,
    potencia: modelo?.potenciaW ?? null,
    cor: moto.cor,
  })

  const sugestao: FichaMoto = {
    xProd: ficha?.xProd ?? `${modelo?.marca ?? ''} ${modelo?.modelo ?? ''}`.trim().toUpperCase(),
    ncm: ficha?.ncm ?? '87116000',
    cest: ficha?.cest ?? '',
    unidade: ficha?.unidade ?? 'UN',
    origem: ficha?.origem ?? '0',
  }

  return { venda, grupoId, cfg, regra, ficha: ficha ?? null, sugestao, observacao, pagamentosMova, valor, pendencias }
}

type Emissao = Awaited<ReturnType<typeof montarEmissao>>

function dadosDaVenda(e: Emissao, ufEmitente: string, idExterno: string): DadosVendaMoto {
  const v = e.venda
  const f = e.ficha!
  return {
    idExterno,
    ambiente: e.cfg.ambiente,
    ufEmitente,
    cliente: {
      tipoPessoa: tipoPessoa(v.clienteCpf),
      nome: v.clienteNome.trim().toUpperCase(),
      cpfCnpj: v.clienteCpf,
      email: v.clienteEmail?.trim() || undefined,
      telefone: v.clienteCelular?.trim() || undefined,
      indicadorIe: v.clienteIndicadorIe && isIndicadorIe(v.clienteIndicadorIe) ? v.clienteIndicadorIe : null,
      inscricaoEstadual: v.clienteInscricaoEstadual?.trim() || undefined,
      endereco: {
        uf: (v.clienteEstado ?? '').trim().toUpperCase(),
        cidade: (v.clienteCidade ?? '').trim(),
        logradouro: (v.clienteLogradouro ?? '').trim(),
        numero: (v.clienteNumero ?? '').trim(),
        complemento: v.clienteComplemento?.trim() || undefined,
        bairro: (v.clienteBairro ?? '').trim(),
        cep: v.clienteCep ?? '',
      },
    },
    moto: {
      xProd: f.xProd ?? '',
      codigo: f.cProd ?? f.xProd ?? '',
      ncm: f.ncm,
      cest: f.cest ?? '',
      unidade: f.unidade ?? 'UN',
      origem: f.origem ?? '0',
    },
    valor: e.valor,
    pagamentos: e.pagamentosMova.map(formaPagamentoNfe),
    informacoesAdicionais: e.observacao,
  }
}

async function resumos(filtro: SQL): Promise<NotaResumo[]> {
  const rows = await db.select({ r: notasFiscaisSaida, pedidoPor: usuarios.nome })
    .from(notasFiscaisSaida)
    .leftJoin(usuarios, eq(usuarios.id, notasFiscaisSaida.cancelamentoPor))
    .where(filtro)
    .orderBy(desc(notasFiscaisSaida.criadoEm))
  return rows.map(({ r, pedidoPor }) => ({
    id: r.id, ambiente: r.ambiente, status: r.status, motivoStatus: r.motivoStatus,
    numero: r.numero, serie: r.serie, linkDanfe: r.linkDanfe, linkXml: r.linkXml,
    criadoEm: r.criadoEm.toISOString(),
    dataAutorizacao: r.dataAutorizacao?.toISOString() ?? null,
    cancelamento: r.cancelamentoEm
      ? { motivo: r.cancelamentoMotivo ?? '', por: pedidoPor, em: r.cancelamentoEm.toISOString(), contador: r.cancelamentoContador }
      : null,
  }))
}

const notasDaVenda = (vendaId: string) => resumos(eq(notasFiscaisSaida.vendaId, vendaId))

export async function previsualizarNfePropriaAction(motoId: string): Promise<PreviaNfe> {
  try {
    const usuario = await exigirPapel()
    const e = await montarEmissao(motoId, usuario)
    const notas = await notasDaVenda(e.venda.id)

    let resumo: Extract<PreviaNfe, { ok: true }>['resumo'] = null
    if (e.ficha && e.regra && !e.pendencias.length) {
      const uf = await ufDaEmpresa(e.cfg)
      const p = montarNfeVendaMoto(dadosDaVenda(e, uf, 'previa'), e.regra)
      const item = p.itens[0]
      const v = e.venda
      resumo = {
        cliente: {
          nome: p.cliente.nome,
          documento: p.cliente.cpfCnpj,
          endereco: [
            `${p.cliente.endereco.logradouro}, ${p.cliente.endereco.numero}`,
            v.clienteComplemento?.trim(),
            p.cliente.endereco.bairro,
            `${p.cliente.endereco.cidade}/${p.cliente.endereco.uf}`,
            `CEP ${p.cliente.endereco.cep}`,
          ].filter(Boolean).join(' — '),
          email: p.cliente.email ?? null,
        },
        produto: {
          descricao: item.descricao,
          ncm: item.ncm,
          cest: item.cest ?? '—',
          cfop: item.cfop,
          cst: item.impostos.icms.situacaoTributaria,
          origemEntrada: e.ficha.origem ?? '0',
          origemSaida: String(item.impostos.icms.origem),
        },
        valor: e.valor,
        pagamentos: p.pedido.pagamento.formas.map(f => ({ tipo: f.descricao ?? f.tipo, valor: f.valor })),
        tributos: {
          pis: `${item.impostos.pis.situacaoTributaria} · ${item.impostos.pis.porAliquota?.aliquota ?? 0}%`,
          cofins: `${item.impostos.cofins.situacaoTributaria} · ${item.impostos.cofins.porAliquota?.aliquota ?? 0}%`,
          aproximado: item.impostos.percentualAproximadoTributos?.detalhado.valorTotal ?? null,
        },
        observacao: e.observacao,
        interestadual: item.cfop === e.regra.cfopInterestadual && e.regra.cfopInterestadual !== e.regra.cfopInterno,
      }
    }

    return {
      ok: true,
      vendaId: e.venda.id,
      ambiente: e.cfg.ambiente,
      jaFaturada: e.venda.notaFiscalSaida,
      pendencias: e.pendencias,
      ficha: e.ficha
        ? { xProd: e.ficha.xProd ?? '', ncm: e.ficha.ncm, cest: e.ficha.cest ?? '', unidade: e.ficha.unidade ?? 'UN', origem: e.ficha.origem ?? '0' }
        : null,
      sugestao: e.sugestao,
      resumo,
      notas,
      correcao: {
        comprador: {
          clienteNome: e.venda.clienteNome, clienteCpf: e.venda.clienteCpf,
          clienteCep: e.venda.clienteCep, clienteLogradouro: e.venda.clienteLogradouro, clienteNumero: e.venda.clienteNumero,
          clienteComplemento: e.venda.clienteComplemento, clienteBairro: e.venda.clienteBairro,
          clienteCidade: e.venda.clienteCidade, clienteEstado: e.venda.clienteEstado,
          clienteIndicadorIe: e.venda.clienteIndicadorIe, clienteInscricaoEstadual: e.venda.clienteInscricaoEstadual,
        },
        moto: { ncm: e.ficha?.ncm ?? '', cest: e.ficha?.cest ?? '' },
      },
      podeConfigurarFiscal: PAPEIS_CONFIG_FISCAL.includes(usuario.papel),
    }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Completa a ficha fiscal na hora de emitir — para as motos cuja nota de
 * entrada nunca foi importada. Não bloqueia a venda: preenche e segue.
 */
export async function salvarFichaMotoAction(motoId: string, f: FichaMoto): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await exigirGrupoDaMoto(motoId, await exigirPapel())
    const ncm = f.ncm.replace(/\D/g, '')
    if (ncm.length !== 8) return { ok: false, error: 'NCM precisa ter 8 dígitos' }
    const c = normalizarCest(f.cest)
    if (!c.ok) return c
    if (!f.xProd.trim()) return { ok: false, error: 'Informe a descrição fiscal do produto' }
    if (!/^[0-8]$/.test(f.origem)) return { ok: false, error: 'Origem inválida' }

    const valores = {
      xProd: f.xProd.trim().toUpperCase(),
      ncm,
      cest: c.cest,
      unidade: f.unidade.trim().toUpperCase() || 'UN',
      origem: f.origem,
    }
    await db.insert(motosFiscal)
      .values({ motoId, emitenteCnpj: 'MANUAL', ...valores })
      .onConflictDoUpdate({ target: motosFiscal.motoId, set: valores })
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Corrige só o CEST da ficha na hora de emitir: a nota de entrada de algumas
 * motos vem sem ele e a SEFAZ recusa a saída com ICMS-ST (806).
 */
export async function salvarCestMotoAction(motoId: string, cestBruto: string): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await exigirGrupoDaMoto(motoId, await exigirPapel())
    const c = normalizarCest(cestBruto)
    if (!c.ok) return c
    const atualizadas = await db.update(motosFiscal).set({ cest: c.cest }).where(eq(motosFiscal.motoId, motoId)).returning({ id: motosFiscal.motoId })
    if (!atualizadas.length) return { ok: false, error: 'Moto sem ficha fiscal' }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Grava a correção da nota recusada no cadastro de origem, sem reenviar (#347). */
export async function salvarCorrecaoNfAction(motoId: string, correcao: CorrecaoNf): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const usuario = await exigirPapel('corrigir')
    const e = await montarEmissao(motoId, usuario)
    await db.transaction(tx => gravarCorrecaoDaNf(tx, usuario, motoId, e.cfg.ambiente, correcao))
    revalidatePath('/vendas')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** "Salvar e reenviar nº N": a nota é remontada do cadastro corrigido e sai com o mesmo número. */
export async function corrigirEReenviarNfAction(motoId: string, correcao: CorrecaoNf): Promise<ResultadoTransmissao> {
  const salvo = await salvarCorrecaoNfAction(motoId, correcao)
  if (!salvo.ok) return salvo
  return transmitirNfePropriaAction(motoId)
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * O "Confirmar NF" ao contrário, só se a venda ainda tem o número desta nota:
 * uma nota nova já pode ter faturado a venda de novo.
 */
async function desfazerFaturamento(tx: Tx, vendaId: string, motoId: string, numero: string) {
  const venda = await tx.update(vendas).set({ notaFiscalSaida: null })
    .where(and(eq(vendas.id, vendaId), eq(vendas.notaFiscalSaida, numero)))
    .returning({ id: vendas.id })
  if (!venda.length) return false
  await tx.update(motos).set({ disponibilidade: null })
    .where(and(eq(motos.id, motoId), eq(motos.disponibilidade, 'vendida')))
  return true
}


/**
 * Grava o retorno da API. Em PRODUÇÃO, nota autorizada fatura a venda e nota
 * cancelada na SEFAZ desfaz o faturamento, na mesma transação: a nota nunca
 * fica num status final com a venda pela metade.
 */
async function aplicarRetorno(notaId: string, n: NfeConsultada, ambiente: string, vendaId: string, motoId: string) {
  const mexeuNaVenda = await db.transaction(async tx => {
    const [antes] = await tx.select({ status: notasFiscaisSaida.status, numero: notasFiscaisSaida.numero, dataAutorizacao: notasFiscaisSaida.dataAutorizacao })
      .from(notasFiscaisSaida).where(eq(notasFiscaisSaida.id, notaId)).limit(1)

    await tx.update(notasFiscaisSaida).set({
      status: n.status,
      motivoStatus: motivoDoStatus(n),
      numero: n.numero, serie: n.serie, chave: n.chave, protocolo: n.protocolo,
      linkDanfe: n.linkDanfe, linkXml: n.linkXml,
      // Resposta sem data não apaga a que já está gravada.
      ...(n.dataAutorizacao ? { dataAutorizacao: new Date(n.dataAutorizacao) } : {}),
      atualizadoEm: sql`now()` as unknown as Date,
    }).where(eq(notasFiscaisSaida.id, notaId))

    const dataAutorizacao = n.dataAutorizacao ?? antes?.dataAutorizacao?.toISOString() ?? null
    const efeito = efeitoNaVenda(antes?.status ?? null, { status: n.status, ambiente, dataAutorizacao })
    if (efeito === 'faturar' && n.numero) {
      // O mesmo efeito do "Confirmar NF" manual: número na venda, moto vendida.
      await tx.update(vendas).set({ notaFiscalSaida: n.numero }).where(eq(vendas.id, vendaId))
      await tx.update(motos).set({ disponibilidade: 'vendida' as any }).where(eq(motos.id, motoId))
      return true
    }

    const numero = n.numero ?? antes?.numero
    if (efeito !== 'desfazer' || !numero) return false
    return desfazerFaturamento(tx, vendaId, motoId, numero)
  })
  if (mexeuNaVenda) {
    revalidatePath('/vendas')
    revalidatePath('/estoque')
  }
}

/** Consulta até a SEFAZ responder ou o tempo acabar — o que sobrar, a tela reconsulta. */
async function acompanhar(cfg: ConfigNotaGateway, idExterno: string, tentativas = 8, terminou: (n: NfeConsultada) => boolean = n => ehFinal(n.status)) {
  let ultima: NfeConsultada | null = null
  for (let i = 0; i < tentativas; i++) {
    await espera(i === 0 ? 2500 : 2000)
    ultima = await consultarNfe(cfg, idExterno)
    if (ultima && terminou(ultima)) break
  }
  return ultima
}

export type ResultadoTransmissao = { ok: true; nota: NotaResumo } | { ok: false; error: string; nota?: NotaResumo }

async function resumoDaNota(id: string): Promise<NotaResumo> {
  const [nota] = await resumos(eq(notasFiscaisSaida.id, id))
  return nota
}

export async function transmitirNfePropriaAction(motoId: string): Promise<ResultadoTransmissao> {
  let notaId: string | null = null
  try {
    const usuario = await exigirPapel()
    const e = await montarEmissao(motoId, usuario)

    const bloqueio = motivoBloqueioNf(await situacaoNfDaVenda(e.venda.id))
    if (bloqueio) return { ok: false, error: bloqueio }
    if (e.pendencias.length) return { ok: false, error: e.pendencias.join('\n') }
    if (!e.ficha) return { ok: false, error: 'Moto sem ficha fiscal — preencha antes de transmitir' }
    if (!e.regra) return { ok: false, error: 'Regra fiscal do grupo não cadastrada' }

    if (e.cfg.ambiente === 'Producao') {
      if (e.venda.notaFiscalSaida) return { ok: false, error: `Esta venda já tem a NF ${e.venda.notaFiscalSaida}` }
      // Nota viva de produção: não emite outra, acompanha a que existe.
      const [viva] = await db.select().from(notasFiscaisSaida).where(and(
        eq(notasFiscaisSaida.vendaId, e.venda.id),
        eq(notasFiscaisSaida.ambiente, 'Producao'),
        notInArray(notasFiscaisSaida.status, STATUS_MORTOS),
      )).limit(1)
      if (viva) {
        const n = await acompanhar(e.cfg, viva.idExterno, 3)
        if (n) await aplicarRetorno(viva.id, n, viva.ambiente, e.venda.id, motoId)
        return { ok: true, nota: await resumoDaNota(viva.id) }
      }
      // Tentativa descartada que aparece depois na Nota Gateway volta a valer
      // (#88): emitir outra seria a segunda NF da venda.
      const descartadas = await db.select().from(notasFiscaisSaida).where(and(
        eq(notasFiscaisSaida.vendaId, e.venda.id),
        eq(notasFiscaisSaida.ambiente, 'Producao'),
        eq(notasFiscaisSaida.status, 'Descartada'),
      ))
      for (const d of descartadas) {
        const n = await consultarNfe(e.cfg, d.idExterno)
        if (!n) continue
        await aplicarRetorno(d.id, n, d.ambiente, e.venda.id, motoId)
        return { ok: true, nota: await resumoDaNota(d.id) }
      }
    }

    const escolha = await escolherTentativa(db, { vendaId: e.venda.id, grupoId: e.grupoId, numeroVenda: e.venda.numero, ambiente: e.cfg.ambiente })
    if (escolha.notaId) {
      // A recusa pode ter mudado na Nota Gateway depois da última consulta: só
      // reenvia o mesmo id se lá ela ainda estiver recusada ou nem existir (4xx).
      const naApi = await consultarNfe(e.cfg, escolha.idExterno)
      if (naApi && !ehRecusada(naApi.status)) {
        await aplicarRetorno(escolha.notaId, naApi, e.cfg.ambiente, e.venda.id, motoId)
        return { ok: true, nota: await resumoDaNota(escolha.notaId) }
      }
    } else {
      // O id pode existir na API sem existir aqui (linha apagada, falha antes de
      // gravar). Reusar um id da API devolveria a nota ANTIGA como se fosse nova.
      let tentativa = escolha.tentativa
      while (await consultarNfe(e.cfg, idExternoNfe(e.venda.numero, tentativa, e.cfg.ambiente))) {
        tentativa++
        if (tentativa > 50) throw new Error('Não achei um número de controle livre para esta nota')
      }
      escolha.idExterno = idExternoNfe(e.venda.numero, tentativa, e.cfg.ambiente)
    }
    const idExterno = escolha.idExterno

    const uf = await ufDaEmpresa(e.cfg)
    const payload = montarNfeVendaMoto(dadosDaVenda(e, uf, idExterno), e.regra)

    notaId = await gravarEnvio(db, escolha, {
      vendaId: e.venda.id, vendaNumero: e.venda.numero, grupoId: e.grupoId, ambiente: e.cfg.ambiente, payload, emitidaPor: usuario.id,
    })
    const envio = { usuarioId: usuario.id, grupoId: e.grupoId, vendaId: e.venda.id, numeroVenda: e.venda.numero, ambiente: e.cfg.ambiente }

    try {
      await enviarNfe(e.cfg, payload)
    } catch (err) {
      const msg = (err as Error).message
      // Recusa de validação (4xx) é definitiva e libera nova tentativa. Rede
      // ou 5xx fica "Enviando": a nota pode ter chegado, e a consulta descobre
      // — reenviar às cegas é que duplicaria.
      if (err instanceof NfeRecusada) {
        await db.update(notasFiscaisSaida)
          .set({ status: 'Negada', motivoStatus: msg, atualizadoEm: sql`now()` as unknown as Date })
          .where(eq(notasFiscaisSaida.id, notaId))
        const recusada = await resumoDaNota(notaId)
        await registrarEnvioSemFalhar(envio, recusada)
        return { ok: false, error: msg, nota: recusada }
      }
      throw err
    }

    await db.update(notasFiscaisSaida)
      .set({ status: 'Processando', atualizadoEm: sql`now()` as unknown as Date })
      .where(eq(notasFiscaisSaida.id, notaId))

    const n = await acompanhar(e.cfg, idExterno)
    if (n) await aplicarRetorno(notaId, n, e.cfg.ambiente, e.venda.id, motoId)

    const nota = await resumoDaNota(notaId)
    // Um registro por envio, com o motivo da recusa (#347).
    await registrarEnvioSemFalhar(envio, nota)
    if (ehRecusada(nota.status)) {
      return { ok: false, error: `A SEFAZ não autorizou: ${nota.motivoStatus ?? 'sem motivo informado'}`, nota }
    }
    return { ok: true, nota }
  } catch (err) {
    const nota = notaId ? await resumoDaNota(notaId).catch(() => undefined) : undefined
    return { ok: false, error: (err as Error).message, nota }
  }
}

/** Erro no log não desfaz a resposta da emissão. */
async function registrarEnvioSemFalhar(envio: Parameters<typeof registrarEnvio>[1], nota: Parameters<typeof registrarEnvio>[2]) {
  try {
    await registrarEnvio(db, envio, nota)
  } catch (e) {
    console.error('[log-acoes] falha ao registrar nf_emitida:', e instanceof Error ? e.message : e)
  }
}

type Usuario = Awaited<ReturnType<typeof exigirPapel>>

/** O grupo é o do CNPJ do registro; o grupo ativo da sessão não conta. */
async function exigirGrupo(usuario: Usuario, grupoId: string) {
  if (!(await podeUsuarioVerGrupo(usuario, grupoId))) throw new Error('Sem permissão para NF de saída deste grupo')
}

async function exigirGrupoDaMoto(motoId: string, usuario: Usuario) {
  const [moto] = await db.select({ lojaId: motos.lojaId }).from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')
  await exigirGrupo(usuario, await getGrupoIdDaLoja(moto.lojaId))
}

/** A nota, a configuração do grupo dela e a moto da venda, com a permissão no grupo da nota. */
async function carregarNota(notaId: string, usuario: Usuario) {
  const [r] = await db.select().from(notasFiscaisSaida).where(eq(notasFiscaisSaida.id, notaId)).limit(1)
  if (!r) throw new Error('Nota não encontrada')
  await exigirGrupo(usuario, r.grupoId)
  const cfg = await configNotaGateway(r.grupoId)
  if (!cfg) throw new Error('Emissão pelo MOVA não configurada para este grupo')
  const vendaId = r.vendaId
  if (!vendaId) throw new Error(`A venda ${r.vendaNumero} desta nota foi cancelada`)
  const [v] = await db.select({ motoId: vendas.motoId }).from(vendas).where(eq(vendas.id, vendaId)).limit(1)
  return { r: { ...r, vendaId }, cfg, motoId: v.motoId }
}

type NotaCarregada = Awaited<ReturnType<typeof carregarNota>>

/** Consulta a API e grava o que ela disser. */
async function reconsultar({ r, cfg, motoId }: NotaCarregada, opcoes: { estrito?: boolean } = {}) {
  const n = await consultarNfe(cfg, r.idExterno, opcoes)
  if (n) await aplicarRetorno(r.id, n, r.ambiente, r.vendaId, motoId)
  return n
}

/** Reconsulta uma nota que ficou em processamento. */
export async function consultarNfePropriaAction(notaId: string): Promise<ResultadoTransmissao> {
  try {
    const nota = await carregarNota(notaId, await exigirPapel('consultar'))
    await reconsultar(nota)
    return { ok: true, nota: await resumoDaNota(nota.r.id) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** A permissão é no grupo da loja da venda. */
async function exigirGrupoDaVenda(vendaId: string, usuario: Usuario) {
  const [venda] = await db.select({ lojaId: vendas.lojaId, notaFiscalSaida: vendas.notaFiscalSaida }).from(vendas).where(eq(vendas.id, vendaId)).limit(1)
  if (!venda) throw new Error('Venda não encontrada')
  await exigirGrupo(usuario, await getGrupoIdDaLoja(venda.lojaId))
  return venda
}

/** As notas do MOVA de uma venda, para o diálogo aberto pelo número da NF. */
export async function notasDaVendaAction(vendaId: string): Promise<{ ok: true; notas: NotaResumo[] } | { ok: false; error: string }> {
  try {
    await exigirGrupoDaVenda(vendaId, await exigirPapel('consultar'))
    return { ok: true, notas: await notasDaVenda(vendaId) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

const prazo = (n: NotaResumo) => (n.dataAutorizacao ? diaEHoraBrt(limiteCancelamento(n.dataAutorizacao).toISOString()) : 'o fim do prazo')

const ORIENTACAO_CANCELAR_VENDA: Record<TravaDoCancelamento, (n: NotaResumo) => string> = {
  emissao_em_andamento: () => `Há uma NF de saída em emissão para esta venda. Consulte pelo botão "NF Saída"; se ela estiver parada em "Enviando" há ${MINUTOS_PARA_DESCARTAR} minutos ou mais, dá para descartar a tentativa por lá. Depois, cancele a venda.`,
  cancelar_nf: n => `A NF ${n.numero} está autorizada na SEFAZ. Cancele a NF antes, até ${prazo(n)}, pelo número dela na coluna "NF Saída"; depois, cancele a venda.`,
  cancelamento_em_andamento: n => `O cancelamento da NF ${n.numero} está em andamento na SEFAZ. Consulte pelo número da NF e cancele a venda depois que ele terminar.`,
  tentar_de_novo: n => `A SEFAZ recusou o cancelamento da NF ${n.numero}${n.motivoStatus ? ` (${n.motivoStatus})` : ''}, e a nota continua valendo. Peça de novo pelo número da NF, até ${prazo(n)}; com a nota cancelada, a venda fica livre.`,
  fora_do_prazo: n => `A NF ${n.numero} passou do prazo de 24h para cancelar: o caminho é o cancelamento extemporâneo na SEFAZ, pedido pela contabilidade. Quando o contador confirmar que a SEFAZ liberou, cancele a NF pelo card dela; depois disso a venda fica livre.`,
  sem_data: n => `Não deu para confirmar o prazo de cancelamento da NF ${n.numero}. Abra a NF pelo número dela, consulte e tente de novo.`,
}

/** A orientação da trava do "Cancelar venda" (ADR-0014 e, para o aux_adm, #191), ou null se a venda pode ser cancelada. */
export async function travaDoCancelamentoDaVendaAction(vendaId: string): Promise<{ ok: true; trava: string | null } | { ok: false; error: string }> {
  try {
    const usuario = await exigirPapel('consultar')
    const venda = await exigirGrupoDaVenda(vendaId, usuario)
    let r = travaDoCancelamentoDaVenda(await notasDaVenda(vendaId), new Date())
    if (r?.trava === 'sem_data') {
      // Sem a data de autorização, o prazo não se calcula: a consulta traz e grava.
      await carregarNota(r.nota.id, usuario).then(reconsultar).catch(() => null)
      r = travaDoCancelamentoDaVenda(await notasDaVenda(vendaId), new Date())
    }
    // A NF do MOVA autorizada também preenche notaFiscalSaida; a orientação dela
    // (cancelar a NF) vem antes da recusa pelo papel.
    return { ok: true, trava: r ? ORIENTACAO_CANCELAR_VENDA[r.trava](r.nota) : travaDoPapel(usuario.papel, venda.notaFiscalSaida) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

const SEM_CANCELAMENTO: Record<Exclude<SituacaoCancelamento, 'disponivel'>, string> = {
  fora_do_prazo: 'Passou o prazo de 24h para cancelar esta nota',
  em_andamento: 'O cancelamento desta nota já está em andamento — consulte em instantes',
  indisponivel: 'Só nota autorizada pode ser cancelada',
  sem_data: 'Não deu para confirmar a data de autorização desta nota — consulte e tente de novo',
}

/**
 * Pede o cancelamento de uma NF autorizada. O motivo fica só no nosso registro:
 * a Nota Gateway manda à SEFAZ sempre "Pedido cancelado". A recusa da SEFAZ volta
 * com ok, porque o bloco da nota mostra o motivo; o erro fica para o que ele não
 * mostra (pedido não aceito, prazo, falta de resposta).
 */
export async function cancelarNfePropriaAction(notaId: string, motivo: string): Promise<ResultadoTransmissao> {
  try {
    const usuario = await exigirPapel('cancelar')
    const texto = motivo.trim()
    if (!texto) return { ok: false, error: 'Informe o motivo do cancelamento' }

    const carregada = await carregarNota(notaId, usuario)
    const { r, cfg } = carregada
    const divergencia = divergenciaDeAmbiente(r.ambiente, cfg.ambiente, 'cancelá-la')
    if (divergencia) return { ok: false, error: divergencia }

    let nota = { status: r.status, dataAutorizacao: r.dataAutorizacao?.toISOString() ?? null }
    if (!nota.dataAutorizacao) {
      // Nota de antes de a data ser gravada: a consulta traz e grava.
      const n = await reconsultar(carregada)
      if (n) nota = { status: n.status, dataAutorizacao: n.dataAutorizacao }
    }
    const situacao = situacaoCancelamento(nota, new Date())
    if (situacao !== 'disponivel') return { ok: false, error: SEM_CANCELAMENTO[situacao], nota: await resumoDaNota(r.id) }

    return await pedirCancelamento(carregada, nota.status, { motivo: texto, por: usuario.id, contador: null })
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Grava quem pediu e por quê, manda o DELETE e acompanha até a SEFAZ responder.
 * Recusa da SEFAZ volta com ok: o card da nota mostra o motivo.
 */
async function pedirCancelamento(
  carregada: NotaCarregada,
  statusAntes: string,
  registro: { motivo: string; por: string; contador: string | null },
): Promise<ResultadoTransmissao> {
  const { r, cfg } = carregada
  await db.update(notasFiscaisSaida).set({
    cancelamentoMotivo: registro.motivo,
    cancelamentoPor: registro.por,
    cancelamentoContador: registro.contador,
    cancelamentoEm: sql`now()` as unknown as Date,
    atualizadoEm: sql`now()` as unknown as Date,
  }).where(eq(notasFiscaisSaida.id, r.id))
  // Só depois de a Nota Gateway aceitar o pedido (cancelada ou em cancelamento).
  const registrar = (status: string) => registrarAcaoSensivelSemFalhar({
    tipo: 'nf_cancelada', usuarioId: registro.por, grupoId: r.grupoId,
    detalhe: { notaId: r.id, vendaId: r.vendaId, numeroNf: r.numero, ambiente: r.ambiente, motivo: registro.motivo, extemporaneo: registro.contador !== null, status },
  })

  const pedido = { statusAntes, em: new Date() }
  try {
    await cancelarNfe(cfg, r.idExterno)
  } catch (err) {
    // Pedido recusado ou sem resposta: a consulta diz em que pé a nota ficou
    // (a nota que já estava cancelada, por exemplo, volta como Cancelada).
    await reconsultar(carregada).catch(() => null)
    const atual = await resumoDaNota(r.id)
    if (atual.status === 'Cancelada' || emCancelamento(atual.status)) {
      await registrar(atual.status)
      return { ok: true, nota: atual }
    }
    const msg = err instanceof CancelamentoRecusado
      ? `A Nota Gateway não aceitou o pedido: ${err.message}`
      : `Não deu para confirmar o pedido de cancelamento (${(err as Error).message}) — consulte e, se a nota continuar autorizada, peça de novo`
    return { ok: false, error: msg, nota: atual }
  }

  const n = await acompanhar(cfg, r.idExterno, 8, c => cancelamentoConcluido(c, pedido))
  if (n) await aplicarRetorno(r.id, n, r.ambiente, r.vendaId, carregada.motoId)
  const atual = await resumoDaNota(r.id)
  if (atual.status === 'Autorizada') {
    return { ok: false, error: 'A Nota Gateway ainda não registrou o pedido: peça de novo em instantes', nota: atual }
  }
  await registrar(atual.status)
  return { ok: true, nota: atual }
}

/**
 * Cancelamento extemporâneo (#176): passadas as 24h, o contador pede à SEFAZ que
 * libere o cancelamento; liberado, o pedido segue pela Nota Gateway como no prazo.
 */
export async function cancelarNfeExtemporaneaAction(notaId: string, motivo: string, contadorBruto: string): Promise<ResultadoTransmissao> {
  try {
    const usuario = await exigirPapel('cancelar')
    const c = normalizarContador(contadorBruto)
    if (!c.ok) return c
    const texto = motivo.trim()
    if (!texto) return { ok: false, error: 'Informe o motivo do cancelamento' }

    const carregada = await carregarNota(notaId, usuario)
    const { r, cfg } = carregada
    const divergencia = divergenciaDeAmbiente(r.ambiente, cfg.ambiente, 'cancelá-la')
    if (divergencia) return { ok: false, error: divergencia }
    const nota = { status: r.status, ambiente: r.ambiente, dataAutorizacao: r.dataAutorizacao?.toISOString() ?? null }
    if (!podeCancelarExtemporaneo(nota, new Date())) {
      return { ok: false, error: 'Só nota de produção autorizada, depois do prazo de 24h, cancela por pedido extemporâneo', nota: await resumoDaNota(r.id) }
    }
    return await pedirCancelamento(carregada, r.status, { motivo: texto, por: usuario.id, contador: c.contador })
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Descarta a tentativa presa em Enviando (#88) só depois de a Nota Gateway
 * confirmar que não conhece a nota. Se ela tiver a nota, vale o status dela, e
 * nada é descartado: emitir de novo duplicaria a NF.
 */
export async function descartarTentativaAction(notaId: string): Promise<ResultadoTransmissao> {
  try {
    const usuario = await exigirPapel('descartar')
    const carregada = await carregarNota(notaId, usuario)
    const { r, cfg } = carregada
    if (!podeDescartarTentativa({ status: r.status, criadoEm: r.criadoEm.toISOString() }, new Date())) {
      return { ok: false, error: `Só a tentativa parada em "Enviando" há ${MINUTOS_PARA_DESCARTAR} minutos ou mais pode ser descartada`, nota: await resumoDaNota(r.id) }
    }
    // Consultar com a configuração de outro ambiente pode dar um "não encontrada" falso.
    const divergencia = divergenciaDeAmbiente(r.ambiente, cfg.ambiente, 'descartá-la')
    if (divergencia) return { ok: false, error: divergencia, nota: await resumoDaNota(r.id) }
    if (await reconsultar(carregada, { estrito: true })) {
      return { ok: false, error: 'A Nota Gateway tem esta nota: nada foi descartado, e o status foi atualizado', nota: await resumoDaNota(r.id) }
    }
    const descartada = await db.update(notasFiscaisSaida).set({
      status: 'Descartada',
      cancelamentoMotivo: 'Tentativa descartada: não chegou à Nota Gateway',
      cancelamentoPor: usuario.id,
      cancelamentoEm: sql`now()` as unknown as Date,
      atualizadoEm: sql`now()` as unknown as Date,
    }).where(and(eq(notasFiscaisSaida.id, r.id), eq(notasFiscaisSaida.status, r.status)))
      .returning({ id: notasFiscaisSaida.id })
    if (!descartada.length) {
      return { ok: false, error: 'A nota mudou de status enquanto era conferida — consulte de novo', nota: await resumoDaNota(r.id) }
    }
    return { ok: true, nota: await resumoDaNota(r.id) }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/** Para o diálogo de NF decidir se mostra a opção — sem montar a nota. */
export async function nfePropriaDisponivelAction(motoId: string): Promise<{ disponivel: boolean; ambiente: 'Homologacao' | 'Producao' | null }> {
  try {
    const usuario = await exigirPapel()
    const [v] = await db.select({ lojaId: vendas.lojaId }).from(vendas)
      .where(eq(vendas.motoId, motoId)).orderBy(desc(vendas.dataVenda)).limit(1)
    if (!v) return { disponivel: false, ambiente: null }
    const grupoId = await getGrupoIdDaLoja(v.lojaId)
    if (!(await podeUsuarioVerGrupo(usuario, grupoId))) return { disponivel: false, ambiente: null }
    const cfg = await configNotaGateway(grupoId)
    return cfg ? { disponivel: true, ambiente: cfg.ambiente } : { disponivel: false, ambiente: null }
  } catch {
    return { disponivel: false, ambiente: null }
  }
}
