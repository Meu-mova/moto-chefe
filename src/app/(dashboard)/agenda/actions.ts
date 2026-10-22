'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { db } from '@/lib/db'
import { agendamentos, ordensServico, lojas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { validarDocumento, isTipoPessoa } from '@/lib/documento'
import { conferirVinculosDaConta } from '@/lib/vinculos-da-conta'

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
  if (!(await podeAgirNaLoja(usuario, lojaId))) throw new Error('Sem permissão para esta loja')
  await conferirVinculosDaConta(lojaId, { mecanicoId: input.mecanicoId })

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

export type VirarOSInput = {
  chassiOs?: string | null
  motoId?: string | null
  clienteId?: string | null
  mecanicoId?: string | null
  descricao?: string | null
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

export async function agendamentoVirarOSAction(agendamentoId: string, input: VirarOSInput = {}) {
  const usuario = await getUsuarioLogado()
  if (!(GESTORES as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  const ag = await verificarTenantAgendamento(agendamentoId, usuario)

  if (ag.osId) throw new Error('Este agendamento já tem uma OS vinculada')

  // O agendamento nasce com dados básicos do cliente; ao virar OS o adm completa
  // veículo e cliente na tela. O que ele não mexeu cai de volta no agendamento.
  const clienteId = input.clienteId ?? ag.clienteId ?? null

  // Mesma trava do abrirOSAction: OS de empresa sem CNPJ e razão social não
  // identifica o tomador na impressão. Só vale pra cliente fora do cadastro.
  const tipoPessoa = input.clienteTipoPessoaExterno && isTipoPessoa(input.clienteTipoPessoaExterno)
    ? input.clienteTipoPessoaExterno
    : 'fisica'
  const doc = validarDocumento(tipoPessoa, input.clienteDocumentoExterno)
  if (!doc.ok) throw new Error(doc.erro)
  const nomeExterno = input.clienteNomeExterno?.trim() || ag.clienteNome
  if (!clienteId && tipoPessoa === 'juridica' && !nomeExterno) {
    throw new Error('Informe a razão social da empresa')
  }
  const mecanicoId = input.mecanicoId !== undefined ? (input.mecanicoId || null) : (ag.mecanicoId || null)
  await conferirVinculosDaConta(ag.lojaId, { motoId: input.motoId, clienteId, mecanicoId })

  const [os] = await db.insert(ordensServico).values({
    lojaId:       ag.lojaId,
    abertaPor:    usuario.id,
    mecanicoId,
    origem:       'agendamento',
    descricao:    input.descricao?.trim() || ag.descricaoCliente || ag.tipoServico,
    agendamentoId,
    chassiOs:     input.chassiOs?.trim().toUpperCase() || null,
    motoId:       input.motoId || null,
    clienteId,
    dataPrevisao: input.dataPrevisao ? new Date(input.dataPrevisao) : null,
    marcaExterna:  input.marcaExterna  || null,
    modeloExterno: input.modeloExterno || null,
    km:            input.km || null,
    clienteNomeExterno: clienteId ? null : nomeExterno,
    clienteFoneExterno: clienteId ? null : (input.clienteFoneExterno?.trim() || ag.clienteFone),
    clienteTipoPessoaExterno: clienteId ? null : tipoPessoa,
    clienteDocumentoExterno:  clienteId ? null : doc.documento,
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

async function verificarTenantAgendamento(agendamentoId: string, usuario: { papel: string; lojaId: string | null; contaId: string | null }) {
  const [ag] = await db
    .select({
      lojaId:           agendamentos.lojaId,
      osId:             agendamentos.osId,
      mecanicoId:       agendamentos.mecanicoId,
      clienteId:        agendamentos.clienteId,
      clienteNome:      agendamentos.clienteNome,
      clienteFone:      agendamentos.clienteFone,
      tipoServico:      agendamentos.tipoServico,
      descricaoCliente: agendamentos.descricaoCliente,
    })
    .from(agendamentos)
    .where(eq(agendamentos.id, agendamentoId))
    .limit(1)

  if (!ag) throw new Error('Agendamento não encontrado')
  if (!(await podeAgirNaLoja(usuario, ag.lojaId))) throw new Error('Sem permissão')
  return ag
}
