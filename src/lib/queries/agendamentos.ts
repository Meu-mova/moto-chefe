import { db } from '@/lib/db'
import { agendamentos, usuarios, lojas, clientes, ordensServico } from '@/lib/db/schema'
import { eq, and, gte, lte, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { startOfDay, endOfDay } from 'date-fns'

export type AgendamentoComDetalhes = Awaited<ReturnType<typeof listarAgendamentos>>[0]

function buildAgendamentoSelect(mecanico: ReturnType<typeof alias<typeof usuarios, 'mecanico'>>) {
  return {
    id:               agendamentos.id,
    lojaId:           agendamentos.lojaId,
    mecanicoId:       agendamentos.mecanicoId,
    clienteId:        agendamentos.clienteId,
    clienteNome:      agendamentos.clienteNome,
    clienteFone:      agendamentos.clienteFone,
    tipoServico:      agendamentos.tipoServico,
    descricaoCliente: agendamentos.descricaoCliente,
    dataHoraInicio:   agendamentos.dataHoraInicio,
    duracaoMinutos:   agendamentos.duracaoMinutos,
    status:           agendamentos.status,
    osId:             agendamentos.osId,
    criadoEm:         agendamentos.criadoEm,
    lojaNome:         lojas.nome,
    mecanicoNome:     mecanico.nome,
    clienteCadNome:   clientes.nome,
    osNumero:         ordensServico.numero,
  }
}

export async function listarAgendamentos(filtros: {
  lojaId?: string
  dataInicio: Date
  dataFim: Date
  mecanicoId?: string
}) {
  const mecanico = alias(usuarios, 'mecanico')
  return db
    .select(buildAgendamentoSelect(mecanico))
    .from(agendamentos)
    .innerJoin(lojas,     eq(agendamentos.lojaId,     lojas.id))
    .leftJoin(mecanico,   eq(agendamentos.mecanicoId, mecanico.id))
    .leftJoin(clientes,   eq(agendamentos.clienteId,  clientes.id))
    .leftJoin(ordensServico, eq(agendamentos.osId,    ordensServico.id))
    .where(and(
      filtros.lojaId ? eq(agendamentos.lojaId, filtros.lojaId) : undefined,
      filtros.mecanicoId ? eq(agendamentos.mecanicoId, filtros.mecanicoId) : undefined,
      gte(agendamentos.dataHoraInicio, filtros.dataInicio),
      lte(agendamentos.dataHoraInicio, filtros.dataFim),
    ))
    .orderBy(agendamentos.dataHoraInicio)
}

export async function listarAgendamentosDodia(lojaId: string | null, data: Date) {
  const mecanico = alias(usuarios, 'mecanico')
  const inicio   = startOfDay(data)
  const fim      = endOfDay(data)
  return db
    .select(buildAgendamentoSelect(mecanico))
    .from(agendamentos)
    .innerJoin(lojas,     eq(agendamentos.lojaId,     lojas.id))
    .leftJoin(mecanico,   eq(agendamentos.mecanicoId, mecanico.id))
    .leftJoin(clientes,   eq(agendamentos.clienteId,  clientes.id))
    .leftJoin(ordensServico, eq(agendamentos.osId,    ordensServico.id))
    .where(and(
      lojaId ? eq(agendamentos.lojaId, lojaId) : undefined,
      gte(agendamentos.dataHoraInicio, inicio),
      lte(agendamentos.dataHoraInicio, fim),
    ))
    .orderBy(agendamentos.dataHoraInicio)
}

export async function buscarAgendamento(id: string) {
  const mecanico = alias(usuarios, 'mecanico')
  const [ag] = await db
    .select(buildAgendamentoSelect(mecanico))
    .from(agendamentos)
    .innerJoin(lojas,     eq(agendamentos.lojaId,     lojas.id))
    .leftJoin(mecanico,   eq(agendamentos.mecanicoId, mecanico.id))
    .leftJoin(clientes,   eq(agendamentos.clienteId,  clientes.id))
    .leftJoin(ordensServico, eq(agendamentos.osId,    ordensServico.id))
    .where(eq(agendamentos.id, id))
    .limit(1)
  return ag ?? null
}

export async function listarHorariosOcupados(lojaId: string, data: Date) {
  const inicio = startOfDay(data)
  const fim    = endOfDay(data)
  const lista  = await db
    .select({ dataHoraInicio: agendamentos.dataHoraInicio, duracaoMinutos: agendamentos.duracaoMinutos })
    .from(agendamentos)
    .where(and(
      eq(agendamentos.lojaId, lojaId),
      gte(agendamentos.dataHoraInicio, inicio),
      lte(agendamentos.dataHoraInicio, fim),
      // exclui cancelados
    ))
  return lista
}
