'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { ordensServico, osItens, aprovacoesVenda } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { podeAprovarPagamentoSensivel } from '@/lib/grupo'

const ADMINS    = ['admin_geral', 'admin_socio'] as const
const EDITORES  = ['admin_geral', 'admin_socio', 'aux_adm', 'mecanico'] as const
const GESTORES  = ['admin_geral', 'admin_socio', 'aux_adm'] as const

async function verificarAcessoOS(osId: string, papeis: readonly string[]) {
  const usuario = await getUsuarioLogado()
  if (!papeis.includes(usuario.papel)) throw new Error('Sem permissão')

  const [os] = await db
    .select({ lojaId: ordensServico.lojaId })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)

  if (!os) throw new Error('OS não encontrada')

  const isAdmin = (ADMINS as readonly string[]).includes(usuario.papel)
  if (!isAdmin && os.lojaId !== usuario.lojaId) throw new Error('Sem permissão')

  return { usuario, isAdmin }
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
  })

  revalidatePath('/ordens-servico')
}

const SEQUENCIA_STATUS = ['aberta', 'oficina', 'em_andamento', 'finalizada', 'pendente_pagamento', 'concluida'] as const

const RESPONSAVEL_TRANSICAO: Record<string, readonly string[]> = {
  oficina:            ['mecanico'],
  em_andamento:       ['mecanico'],
  finalizada:         ['mecanico'],
  pendente_pagamento: GESTORES,
}

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
  if (!isAdmin && os.lojaId !== usuario.lojaId) throw new Error('Sem permissão')

  const idxAtual = SEQUENCIA_STATUS.indexOf(os.status as typeof SEQUENCIA_STATUS[number])
  const proximoEsperado = SEQUENCIA_STATUS[idxAtual + 1]
  if (novoStatus !== proximoEsperado) {
    throw new Error('Transição de status inválida')
  }

  const responsaveis = RESPONSAVEL_TRANSICAO[novoStatus]
  if (!responsaveis || !responsaveis.includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

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
  await verificarAcessoOS(osId, EDITORES)
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

const TIPO_CARTAO_OS: Record<string, string> = {
  'Cartão de Crédito': 'cartao_credito',
  'Cartão de Débito':  'cartao_debito',
}

// 'Transferência' precisa da mesma aprovação exigida em venda de moto — só quem tem
// podeAprovarPagamentoSensivel vê esse dado. Ver src/lib/grupo.ts.
const TIPOS_PAGAMENTO_SENSIVEL_OS = new Set(['Transferência'])

export type DadosPagamentoOS = {
  valorTotal: number
  formaPagamento: string
  operadora?: string
  parcelas?: number
  autorizacao?: string
}

// Aplica o pagamento de fato na OS — sem checagem de permissão/sensibilidade, usada
// tanto pelo fechamento direto quanto pela aprovação de pagamento sensível.
export async function aplicarPagamentoOS(osId: string, dados: DadosPagamentoOS) {
  const [osAtual] = await db
    .select({ status: ordensServico.status })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)

  const tipoCartao = TIPO_CARTAO_OS[dados.formaPagamento]
  const pagamentos = tipoCartao
    ? [{
        tipo:  tipoCartao,
        valor: dados.valorTotal,
        ...(dados.operadora   ? { operadora: dados.operadora }     : {}),
        ...(dados.parcelas    ? { parcelas: dados.parcelas }       : {}),
        ...(dados.autorizacao ? { autorizacao: dados.autorizacao } : {}),
      }]
    : null

  await db.update(ordensServico).set({
    valorTotal:     String(dados.valorTotal),
    formaPagamento: dados.formaPagamento,
    pagamentos,
    ...(osAtual?.status === 'pendente_pagamento'
      ? { status: 'concluida' as any, dataConclusao: new Date() }
      : {}),
  }).where(eq(ordensServico.id, osId))
  revalidatePath('/ordens-servico')
  revalidatePath(`/ordens-servico/${osId}`)
}

export async function registrarPagamentoOSAction(osId: string, dados: DadosPagamentoOS) {
  const { usuario } = await verificarAcessoOS(osId, GESTORES)

  if (TIPOS_PAGAMENTO_SENSIVEL_OS.has(dados.formaPagamento) && !podeAprovarPagamentoSensivel(usuario)) {
    const [os] = await db
      .select({ lojaId: ordensServico.lojaId, numero: ordensServico.numero })
      .from(ordensServico)
      .where(eq(ordensServico.id, osId))
      .limit(1)
    if (!os) throw new Error('OS não encontrada')

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

  await aplicarPagamentoOS(osId, dados)
  return { aguardandoAprovacao: false }
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

export async function excluirOSAction(osId: string) {
  const usuario = await getUsuarioLogado()
  if (!(ADMINS as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const [os] = await db
    .select({ id: ordensServico.id })
    .from(ordensServico)
    .where(eq(ordensServico.id, osId))
    .limit(1)
  if (!os) throw new Error('OS não encontrada')

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
    .select({ quantidade: osItens.quantidade, valorUnitario: osItens.valorUnitario })
    .from(osItens)
    .where(eq(osItens.osId, osId))

  const total = itens.reduce(
    (acc, i) => acc + parseFloat(i.quantidade) * parseFloat(i.valorUnitario), 0,
  )
  await db.update(ordensServico)
    .set({ valorTotal: String(total) })
    .where(eq(ordensServico.id, osId))
}
