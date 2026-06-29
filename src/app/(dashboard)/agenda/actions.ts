'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { agendamentos, ordensServico, lojas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm'] as const

const TIPOS_SERVICO_PERMITIDOS = new Set([
  'Revisão geral', 'Troca de óleo', 'Freios', 'Pneus', 'Elétrica',
  'Motor', 'Suspensão', 'Escapamento', 'Garantia / Pós-venda', 'Outros',
])

export type CriarAgendamentoInput = {
  lojaId: string
  mecanicoId?: string | null
  clienteNome: string
  clienteFone: string
  tipoServico: string
  descricaoCliente?: string | null
  dataHoraInicio: string
  duracaoMinutos?: number
}

export async function criarAgendamentoAction(input: CriarAgendamentoInput) {
  const usuario = await getUsuarioLogado()
  if (!(GESTORES as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão para criar agendamentos')
  }
  // Não-admins ficam restritos à própria loja — nunca usam input.lojaId
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const lojaId  = isAdmin ? input.lojaId : usuario.lojaId
  if (!lojaId) throw new Error('Loja não identificada')

  const [ag] = await db.insert(agendamentos).values({
    lojaId,
    mecanicoId:       input.mecanicoId || null,
    clienteNome:      input.clienteNome.trim().slice(0, 200),
    clienteFone:      input.clienteFone.trim().slice(0, 30),
    tipoServico:      input.tipoServico.slice(0, 100),
    descricaoCliente: input.descricaoCliente?.trim().slice(0, 1000) || null,
    dataHoraInicio:   new Date(input.dataHoraInicio),
    duracaoMinutos:   input.duracaoMinutos ?? 60,
    status:           'pendente',
    criadoPor:        usuario.id,
  }).returning({ id: agendamentos.id })

  revalidatePath('/agenda')
  return ag
}

export async function confirmarAgendamentoAction(agendamentoId: string) {
  const usuario = await getUsuarioLogado()
  if (!(GESTORES as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  await verificarTenantAgendamento(agendamentoId, usuario)
  await db.update(agendamentos).set({ status: 'confirmado' })
    .where(eq(agendamentos.id, agendamentoId))
  revalidatePath('/agenda')
}

export async function cancelarAgendamentoAction(agendamentoId: string) {
  const usuario = await getUsuarioLogado()
  if (!(GESTORES as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  await verificarTenantAgendamento(agendamentoId, usuario)
  await db.update(agendamentos).set({ status: 'cancelado' })
    .where(eq(agendamentos.id, agendamentoId))
  revalidatePath('/agenda')
}

export async function agendamentoVirarOSAction(agendamentoId: string) {
  const usuario = await getUsuarioLogado()
  if (!(GESTORES as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  const ag = await verificarTenantAgendamento(agendamentoId, usuario)

  if (ag.osId) throw new Error('Este agendamento já tem uma OS vinculada')

  const [os] = await db.insert(ordensServico).values({
    lojaId:       ag.lojaId,
    abertaPor:    usuario.id,
    mecanicoId:   ag.mecanicoId || null,
    tipoOs:       'externa',
    origem:       'agendamento',
    descricao:    ag.descricaoCliente || ag.tipoServico,
    agendamentoId,
    clienteNomeExterno: ag.clienteNome,
    clienteFoneExterno: ag.clienteFone,
  }).returning({ id: ordensServico.id, numero: ordensServico.numero })

  await db.update(agendamentos)
    .set({ osId: os.id, status: 'confirmado' })
    .where(eq(agendamentos.id, agendamentoId))

  revalidatePath('/agenda')
  revalidatePath('/ordens-servico')
  return os
}

// ─── Portal público (sem auth de usuário) ────────────────────────────────────

export async function agendarPublicoAction(input: {
  lojaId: string
  clienteNome: string
  clienteFone: string
  tipoServico: string
  descricaoCliente?: string
  dataHoraInicio: string
}) {
  // Validações de input
  if (!input.clienteNome?.trim()) throw new Error('Informe seu nome')
  if (!input.clienteFone?.trim()) throw new Error('Informe seu telefone')
  if (!input.tipoServico)         throw new Error('Selecione o tipo de serviço')
  if (!input.dataHoraInicio)      throw new Error('Selecione data e horário')

  // Tipo de serviço deve ser da lista permitida
  if (!TIPOS_SERVICO_PERMITIDOS.has(input.tipoServico)) {
    throw new Error('Tipo de serviço inválido')
  }

  const data = new Date(input.dataHoraInicio)
  if (isNaN(data.getTime())) throw new Error('Data inválida')
  if (data < new Date())     throw new Error('Não é possível agendar no passado')

  // Agendamento máximo 90 dias no futuro
  const maxData = new Date(); maxData.setDate(maxData.getDate() + 90)
  if (data > maxData) throw new Error('Data muito distante')

  // Verificar que a loja existe e aceita agendamentos públicos
  const [loja] = await db
    .select({ id: lojas.id })
    .from(lojas)
    .where(eq(lojas.id, input.lojaId))
    .limit(1)
  if (!loja) throw new Error('Loja não encontrada')

  const [ag] = await db.insert(agendamentos).values({
    lojaId:           loja.id,                                          // loja verificada, não do input
    clienteNome:      input.clienteNome.trim().slice(0, 200),
    clienteFone:      input.clienteFone.trim().slice(0, 30),
    tipoServico:      input.tipoServico,                                // já validado contra allowlist
    descricaoCliente: input.descricaoCliente?.trim().slice(0, 500) || null,
    dataHoraInicio:   data,
    duracaoMinutos:   60,
    status:           'pendente',
  }).returning({ id: agendamentos.id })

  return ag
}

// ─── Helper ───────────────────────────────────────────────────────────────────

async function verificarTenantAgendamento(agendamentoId: string, usuario: { papel: string; lojaId: string | null }) {
  const [ag] = await db
    .select({
      lojaId:           agendamentos.lojaId,
      osId:             agendamentos.osId,
      mecanicoId:       agendamentos.mecanicoId,
      clienteNome:      agendamentos.clienteNome,
      clienteFone:      agendamentos.clienteFone,
      tipoServico:      agendamentos.tipoServico,
      descricaoCliente: agendamentos.descricaoCliente,
    })
    .from(agendamentos)
    .where(eq(agendamentos.id, agendamentoId))
    .limit(1)

  if (!ag) throw new Error('Agendamento não encontrado')
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  if (!isAdmin && ag.lojaId !== usuario.lojaId) throw new Error('Sem permissão')
  return ag
}
