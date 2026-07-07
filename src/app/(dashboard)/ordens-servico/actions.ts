'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { ordensServico, osItens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

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
  placa?: string | null
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
    placa:              input.placa  || null,
    km:                 input.km     || null,
    clienteNomeExterno: input.clienteNomeExterno || null,
    clienteFoneExterno: input.clienteFoneExterno || null,
  })

  revalidatePath('/ordens-servico')
}

export async function atualizarStatusOSAction(osId: string, novoStatus: string) {
  await verificarAcessoOS(osId, EDITORES)
  await db.update(ordensServico)
    .set({
      status: novoStatus as any,
      ...(novoStatus === 'concluida' ? { dataConclusao: new Date() } : {}),
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
  placa?: string | null
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
    placa:              dados.placa !== undefined ? (dados.placa || null)            : undefined,
    km:                 dados.km   !== undefined ? (dados.km   || null)             : undefined,
    clienteNomeExterno: dados.clienteNomeExterno !== undefined ? (dados.clienteNomeExterno || null) : undefined,
    clienteFoneExterno: dados.clienteFoneExterno !== undefined ? (dados.clienteFoneExterno || null) : undefined,
  }).where(eq(ordensServico.id, osId))
  revalidatePath(`/ordens-servico/${osId}`)
}

export async function registrarPagamentoOSAction(osId: string, dados: {
  valorTotal: number
  formaPagamento: string
}) {
  await verificarAcessoOS(osId, GESTORES)
  await db.update(ordensServico).set({
    valorTotal:     String(dados.valorTotal),
    formaPagamento: dados.formaPagamento,
  }).where(eq(ordensServico.id, osId))
  revalidatePath(`/ordens-servico/${osId}`)
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
