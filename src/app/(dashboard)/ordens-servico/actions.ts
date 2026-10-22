'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { db } from '@/lib/db'
import { ordensServico, osItens, aprovacoesVenda, conciliacoesCartao, pixRecebimentosMcp, cuponsRevisao } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { podeAprovarPagamentoSensivelNaLoja, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import type { PgtoOS } from '@/lib/conciliacao-status'
import { PAPEIS_CANCELAM_OS, motivoBloqueioCancelamento } from '@/lib/os-cancelamento'
import { GESTORES, podeAvancarOS } from '@/lib/os-transicao'
import { validarDocumento, isTipoPessoa } from '@/lib/documento'
import { hojeBrt } from '@/lib/data-venda'
import { aplicarPagamentoOS, type DadosPagamentoOS } from '@/lib/pagamento-os'
import { conferirVinculosDaConta } from '@/lib/vinculos-da-conta'
import {
  TIPO_PAGAMENTO_CUPOM, normalizarCodigoCupom, motivoCupomInvalido,
} from '@/lib/cupom-revisao'

const ADMINS    = ['admin_geral', 'admin_socio'] as const
const EDITORES  = ['admin_geral', 'admin_socio', 'aux_adm', 'mecanico'] as const

async function verificarAcessoOS(osId: string, papeis: readonly string[]) {
  const usuario = await getUsuarioLogado()
  if (!papeis.includes(usuario.papel)) throw new Error('Sem permissão')

  const [os] = await db
    .select({ lojaId: ordensServico.lojaId, status: ordensServico.status })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)

  if (!os) throw new Error('OS não encontrada')

  const isAdmin = (ADMINS as readonly string[]).includes(usuario.papel)
  if (!(await podeAgirNaLoja(usuario, os.lojaId))) throw new Error('Sem permissão')

  // OS cancelada é registro morto — nada nela pode mudar depois disso.
  if (os.status === 'cancelada') throw new Error('OS cancelada não pode ser alterada')

  return { usuario, isAdmin, os }
}

// Dinheiro amarrado na OS. Cancelar exige tudo zerado (não há estorno de caixa);
// mexer nos itens exige pelo menos que nada esteja conciliado, senão o valor da OS
// deixa de bater com o que já foi conferido no extrato.
async function situacaoFinanceiraOS(osId: string) {
  const [os] = await db
    .select({
      status:         ordensServico.status,
      formaPagamento: ordensServico.formaPagamento,
      pagamentos:     ordensServico.pagamentos,
    })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os) throw new Error('OS não encontrada')

  const [cartoes, pix, aprovacoes] = await Promise.all([
    db.$count(conciliacoesCartao, and(eq(conciliacoesCartao.osId, osId), eq(conciliacoesCartao.conciliado, true))),
    db.$count(pixRecebimentosMcp, eq(pixRecebimentosMcp.osId, osId)),
    db.$count(aprovacoesVenda, and(eq(aprovacoesVenda.osId, osId), eq(aprovacoesVenda.status, 'pendente'))),
  ])

  return {
    temPagamento:   Boolean(os.formaPagamento) || (os.pagamentos?.length ?? 0) > 0 || os.status === 'concluida',
    temConciliacao: cartoes > 0 || pix > 0,
    temAprovacaoPendente: aprovacoes > 0,
  }
}

type AbrirOSInput = {
  lojaId: string
  chassiOs?: string | null
  motoId?: string | null
  mecanicoId?: string | null
  clienteId?: string | null
  descricao: string
  dataPrevisao?: string | null
  marcaExterna?: string | null
  modeloExterno?: string | null
  km?: number | null
  clienteNomeExterno?: string | null
  clienteFoneExterno?: string | null
  /** 'fisica' (padrão) ou 'juridica' — OS aberta para empresa. */
  clienteTipoPessoaExterno?: string | null
  /** CPF/CNPJ do cliente que não está no cadastro. Obrigatório quando é empresa. */
  clienteDocumentoExterno?: string | null
}

export async function abrirOSAction(input: AbrirOSInput) {
  const usuario = await getUsuarioLogado()
  if (!(GESTORES as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão para abrir OS')
  }

  // Admins podem escolher qualquer loja; demais usuários ficam restritos à própria loja
  const isAdmin = (ADMINS as readonly string[]).includes(usuario.papel)
  const lojaId  = isAdmin ? (input.lojaId || usuario.lojaId) : usuario.lojaId
  if (!lojaId) throw new Error('Loja não identificada')
  if (!(await podeAgirNaLoja(usuario, lojaId))) throw new Error('Sem permissão para esta loja')

  // OS para empresa: sem CNPJ e razão social a impressão não identifica o tomador,
  // e é ela que a empresa leva pra lançar o serviço. Só vale para cliente fora do
  // cadastro — quem tem `clienteId` já carrega tipo e documento em `clientes`.
  const tipoPessoa = input.clienteTipoPessoaExterno && isTipoPessoa(input.clienteTipoPessoaExterno)
    ? input.clienteTipoPessoaExterno
    : 'fisica'
  const doc = validarDocumento(tipoPessoa, input.clienteDocumentoExterno)
  if (!doc.ok) throw new Error(doc.erro)
  if (!input.clienteId && tipoPessoa === 'juridica' && !input.clienteNomeExterno?.trim()) {
    throw new Error('Informe a razão social da empresa')
  }
  await conferirVinculosDaConta(lojaId, { motoId: input.motoId, clienteId: input.clienteId, mecanicoId: input.mecanicoId })

  await db.insert(ordensServico).values({
    lojaId,
    abertaPor:          usuario.id,
    chassiOs:           input.chassiOs?.trim().toUpperCase() || null,
    motoId:             input.motoId      || null,
    mecanicoId:         input.mecanicoId  || null,
    clienteId:          input.clienteId   || null,
    descricao:          input.descricao,
    dataPrevisao:       input.dataPrevisao ? new Date(input.dataPrevisao) : null,
    marcaExterna:       input.marcaExterna  || null,
    modeloExterno:      input.modeloExterno || null,
    km:                 input.km     || null,
    clienteNomeExterno: input.clienteNomeExterno || null,
    clienteFoneExterno: input.clienteFoneExterno || null,
    clienteTipoPessoaExterno: input.clienteId ? null : tipoPessoa,
    clienteDocumentoExterno:  input.clienteId ? null : doc.documento,
  })

  revalidatePath('/ordens-servico')
}

const SEQUENCIA_STATUS = ['aberta', 'oficina', 'em_andamento', 'finalizada', 'pendente_pagamento', 'concluida'] as const

const COLUNA_TIMESTAMP_TRANSICAO: Record<string, 'oficinaEm' | 'emAndamentoEm' | 'finalizadaEm' | 'pendentePagamentoEm'> = {
  oficina:            'oficinaEm',
  em_andamento:       'emAndamentoEm',
  finalizada:         'finalizadaEm',
  pendente_pagamento: 'pendentePagamentoEm',
}

export async function atualizarStatusOSAction(osId: string, novoStatus: string) {
  const usuario = await getUsuarioLogado()

  const [os] = await db
    .select({ status: ordensServico.status, lojaId: ordensServico.lojaId })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os) throw new Error('OS não encontrada')

  const isAdmin = (ADMINS as readonly string[]).includes(usuario.papel)
  if (!(await podeAgirNaLoja(usuario, os.lojaId))) throw new Error('Sem permissão')

  if (os.status === 'cancelada') throw new Error('OS cancelada não pode ser alterada')

  const idxAtual = SEQUENCIA_STATUS.indexOf(os.status as typeof SEQUENCIA_STATUS[number])
  const proximoEsperado = SEQUENCIA_STATUS[idxAtual + 1]
  if (novoStatus !== proximoEsperado) {
    throw new Error('Transição de status inválida')
  }

  if (!podeAvancarOS(novoStatus, usuario.papel)) throw new Error('Sem permissão')

  const colunaTempo = COLUNA_TIMESTAMP_TRANSICAO[novoStatus]

  await db.update(ordensServico)
    .set({
      status: novoStatus as any,
      ...(colunaTempo ? { [colunaTempo]: new Date() } : {}),
    })
    .where(eq(ordensServico.id, osId))
  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
}

export async function atualizarOSAction(osId: string, dados: {
  mecanicoId?: string | null
  descricao?: string
  diagnostico?: string
  observacoesFinais?: string
  dataPrevisao?: string | null
  km?: number | null
  clienteNomeExterno?: string | null
  clienteFoneExterno?: string | null
}) {
  const { os } = await verificarAcessoOS(osId, EDITORES)
  await conferirVinculosDaConta(os.lojaId, { mecanicoId: dados.mecanicoId })
  await db.update(ordensServico).set({
    mecanicoId:         dados.mecanicoId !== undefined ? (dados.mecanicoId || null) : undefined,
    descricao:          dados.descricao  !== undefined ? dados.descricao            : undefined,
    diagnostico:        dados.diagnostico !== undefined ? dados.diagnostico         : undefined,
    observacoesFinais:  dados.observacoesFinais !== undefined ? dados.observacoesFinais : undefined,
    dataPrevisao:       dados.dataPrevisao !== undefined
      ? (dados.dataPrevisao ? new Date(dados.dataPrevisao) : null) : undefined,
    km:                 dados.km   !== undefined ? (dados.km   || null)             : undefined,
    clienteNomeExterno: dados.clienteNomeExterno !== undefined ? (dados.clienteNomeExterno || null) : undefined,
    clienteFoneExterno: dados.clienteFoneExterno !== undefined ? (dados.clienteFoneExterno || null) : undefined,
  }).where(eq(ordensServico.id, osId))
  revalidatePath(`/ordens-servico/${osId}`)
}

// 'transferencia' precisa da mesma aprovação exigida em venda de moto — só quem tem
// podeAprovarPagamentoSensivelNaLoja vê esse dado. Ver src/lib/grupo.ts.
const TIPOS_PAGAMENTO_SENSIVEL_OS = new Set(['transferencia'])

export async function registrarPagamentoOSAction(osId: string, dados: DadosPagamentoOS) {
  const { usuario } = await verificarAcessoOS(osId, GESTORES)

  await validarCupomDoPagamento(usuario, osId, dados.pagamentos)

  const somatorio = dados.pagamentos.reduce((a, p) => a + (Number(p.valor) || 0), 0)
  if (dados.valorTotal >= 0.01 && Math.abs(somatorio - dados.valorTotal) > 0.01) {
    throw new Error('A soma dos pagamentos precisa bater com o valor total da OS')
  }
  if (dados.valorTotal < 0.01 && dados.pagamentos.length > 0) {
    throw new Error('OS gratuita não deve ter formas de pagamento lançadas')
  }

  if (dados.pagamentos.some(p => TIPOS_PAGAMENTO_SENSIVEL_OS.has(p.tipo))) {
    // A loja da OS é quem define o grupo em que a permissão é avaliada.
    const [os] = await db
      .select({ lojaId: ordensServico.lojaId, numero: ordensServico.numero })
      .from(ordensServico)
      .where(eq(ordensServico.id, osId))
      .limit(1)
    if (!os) throw new Error('OS não encontrada')

    if (!(await podeAprovarPagamentoSensivelNaLoja(usuario, os.lojaId))) {
      await db.insert(aprovacoesVenda).values({
        origem: 'os',
        osId,
        lojaId: os.lojaId,
        vendedorId: usuario.id,
        valor: String(dados.valorTotal),
        dadosVenda: dados,
        motivo: `Pagamento via Transferência Bancária — OS #${os.numero ?? '—'}`,
        tipo: 'pagamento_sensivel',
        status: 'pendente',
      })
      revalidatePath('/ordens-servico')
      revalidatePath(`/ordens-servico/${osId}`)
      return { aguardandoAprovacao: true }
    }
  }

  await aplicarPagamentoOS(osId, dados)
  return { aguardandoAprovacao: false }
}

/**
 * Trava do cupom de revisão. A tela já consulta o código antes de salvar, mas ela é
 * conveniência: quem impede o resgate indevido é aqui.
 *
 * O cupom cobre EXATAMENTE a mão de obra da OS (decisão do Cesar em 01/09/2026) —
 * peça e óleo o cliente paga. Deixar o operador digitar outro valor transformaria o
 * cupom num desconto livre sem rastro de quem autorizou.
 */
async function validarCupomDoPagamento(
  usuario: { id: string; papel: string; lojaId: string | null; gruposAcesso: string[] | null; contaId: string | null },
  osId: string,
  pagamentos: PgtoOS[],
) {
  const linhas = pagamentos.filter(p => p.tipo === TIPO_PAGAMENTO_CUPOM)
  if (linhas.length === 0) return
  if (linhas.length > 1) throw new Error('Só um cupom de revisão por OS')

  const codigo = normalizarCodigoCupom(linhas[0].cupom)
  if (!codigo) throw new Error('Informe o código do cupom de revisão')

  const [os] = await db
    .select({ valorServicos: ordensServico.valorServicos })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os) throw new Error('OS não encontrada')
  const valorServicos = parseFloat(os.valorServicos ?? '0')

  // Escopo de grupo: cupom emitido em Pouso Alegre vale na revisão feita em Varginha.
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const [cupom] = await db
    .select({ status: cuponsRevisao.status, validoAte: cuponsRevisao.validoAte, osId: cuponsRevisao.osId })
    .from(cuponsRevisao)
    .where(and(eq(cuponsRevisao.codigo, codigo), inArray(cuponsRevisao.lojaId, lojaIdsGrupo)))
    .limit(1)

  const motivo = motivoCupomInvalido(cupom ?? null, { hoje: hojeBrt(), osId, valorServicos })
  if (motivo) throw new Error(motivo)

  if (Math.abs(Number(linhas[0].valor) - valorServicos) > 0.01) {
    throw new Error(
      `O cupom cobre exatamente a mão de obra da OS (${valorServicos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})`,
    )
  }
}

// Mexer no valor da OS depois que o pagamento já foi conferido no extrato faria o
// total divergir da conciliação — a partir daí a OS é só leitura.
async function garantirOSNaoConciliada(osId: string) {
  const { temConciliacao } = await situacaoFinanceiraOS(osId)
  if (temConciliacao) {
    throw new Error('OS já conciliada — não é possível alterar os itens')
  }
}

export async function adicionarItemOSAction(osId: string, item: {
  tipo: 'servico' | 'peca'
  descricao: string
  quantidade: number
  valorUnitario: number
  servicoId?: string | null
  pecaId?: string | null
}) {
  await verificarAcessoOS(osId, EDITORES)
  await garantirOSNaoConciliada(osId)
  await db.insert(osItens).values({
    osId,
    tipo:          item.tipo,
    descricao:     item.descricao,
    quantidade:    String(item.quantidade),
    valorUnitario: String(item.valorUnitario),
    servicoId:     item.servicoId || null,
    pecaId:        item.pecaId || null,
  })
  await recalcularTotal(osId)
  revalidatePath(`/ordens-servico/${osId}`)
}

export async function removerItemOSAction(itemId: string, osId: string) {
  await verificarAcessoOS(osId, EDITORES)
  await garantirOSNaoConciliada(osId)

  // Verificar que o item pertence à OS informada (evita IDOR no item)
  const [item] = await db
    .select({ osId: osItens.osId })
    .from(osItens)
    .where(eq(osItens.id, itemId))
    .limit(1)
  if (!item || item.osId !== osId) throw new Error('Item não encontrado')

  await db.delete(osItens).where(eq(osItens.id, itemId))
  await recalcularTotal(osId)
  revalidatePath(`/ordens-servico/${osId}`)
}

export async function cancelarOSAction(osId: string, motivo: string) {
  // PAPEIS_CANCELAM_OS inclui aux_adm; verificarAcessoOS já prende quem não é
  // admin à própria loja, então o aux_adm só cancela OS da loja dele.
  const { usuario } = await verificarAcessoOS(osId, PAPEIS_CANCELAM_OS)

  const motivoLimpo = motivo.trim()
  if (motivoLimpo.length < 5) throw new Error('Informe o motivo do cancelamento')

  const situacao = await situacaoFinanceiraOS(osId)
  const bloqueio = motivoBloqueioCancelamento({ ...situacao, jaCancelada: false })
  if (bloqueio) throw new Error(bloqueio)

  await db.update(ordensServico).set({
    status:             'cancelada',
    motivoCancelamento: motivoLimpo,
    canceladaEm:        new Date(),
    canceladaPor:       usuario.id,
  }).where(eq(ordensServico.id, osId))

  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
}

export async function excluirOSAction(osId: string) {
  const usuario = await getUsuarioLogado()
  if (!(ADMINS as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const [os] = await db
    .select({ id: ordensServico.id, lojaId: ordensServico.lojaId })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os || !(await podeAgirNaLoja(usuario, os.lojaId))) throw new Error('OS não encontrada')

  try {
    await db.delete(ordensServico).where(eq(ordensServico.id, osId))
  } catch (e: any) {
    const isFk = e.code === '23503' || e.cause?.code === '23503'
    if (isFk) throw new Error('Não é possível excluir — existe uma garantia ou agendamento vinculado a esta OS')
    throw e
  }

  revalidatePath('/ordens-servico')
}

async function recalcularTotal(osId: string) {
  const itens = await db
    .select({ tipo: osItens.tipo, quantidade: osItens.quantidade, valorUnitario: osItens.valorUnitario })
    .from(osItens)
    .where(eq(osItens.osId, osId))

  const somaPorTipo = (tipo: string) => itens
    .filter(i => i.tipo === tipo)
    .reduce((acc, i) => acc + parseFloat(i.quantidade) * parseFloat(i.valorUnitario), 0)

  const valorServicos = somaPorTipo('servico')
  const valorPecas    = somaPorTipo('peca')

  await db.update(ordensServico)
    .set({
      valorTotal:    String(valorServicos + valorPecas),
      valorServicos: String(valorServicos),
      valorPecas:    String(valorPecas),
    })
    .where(eq(ordensServico.id, osId))
}
