import { db } from '@/lib/db'
import { kommoLeads, kommoUserMap, usuarios, kommoAtividadeDiaria } from '@/lib/db/schema'
import { sql, eq, and, gte, lte, inArray } from 'drizzle-orm'

export type LinhaAtendimento = {
  usuarioId: string | null
  kommoUserId: string
  nome: string
  vinculado: boolean
  volume: number
  ganhos: number
  perdidos: number
  valor: number
  ganhosSemValor: number
  conversao: number
  mensagens: number
  tarefas: number
  tempoRespSeg: number | null
}

// Volume = leads criados no período. Ganhos/perdidos/valor = leads fechados no
// período (status 142 ganho / 143 perdido). Atividade (mensagens/tarefas/tempo
// de resposta) vem dos agregados diários (dia entre deStr..ateStr).
// lojaIds = lojas do grupo ativo — só colaboradores desse grupo aparecem.
export async function metricasAtendimento(inicio: Date, fim: Date, deStr: string, ateStr: string, lojaIds: string[]): Promise<LinhaAtendimento[]> {
  if (lojaIds.length === 0) return []
  // ISO string, não Date — o postgres.js (prepare:false) quebra com Date dentro do sql``
  const iniIso = inicio.toISOString()
  const fimIso = fim.toISOString()
  const [leadsRows, ativRows] = await Promise.all([
    db
      .select({
        kommoUserId: kommoUserMap.kommoUserId,
        usuarioId: kommoUserMap.usuarioId,
        nomeMova: usuarios.nome,
        nomeKommo: kommoUserMap.nomeKommo,
        volume: sql<number>`count(*) filter (where ${kommoLeads.criadoEm} >= ${iniIso} and ${kommoLeads.criadoEm} <= ${fimIso})`,
        ganhos: sql<number>`count(*) filter (where ${kommoLeads.statusId} = 142 and ${kommoLeads.fechadoEm} >= ${iniIso} and ${kommoLeads.fechadoEm} <= ${fimIso})`,
        perdidos: sql<number>`count(*) filter (where ${kommoLeads.statusId} = 143 and ${kommoLeads.fechadoEm} >= ${iniIso} and ${kommoLeads.fechadoEm} <= ${fimIso})`,
        valor: sql<string>`coalesce(sum(${kommoLeads.price}) filter (where ${kommoLeads.statusId} = 142 and ${kommoLeads.fechadoEm} >= ${iniIso} and ${kommoLeads.fechadoEm} <= ${fimIso}), 0)`,
        ganhosSemValor: sql<number>`count(*) filter (where ${kommoLeads.statusId} = 142 and ${kommoLeads.fechadoEm} >= ${iniIso} and ${kommoLeads.fechadoEm} <= ${fimIso} and ${kommoLeads.price} = 0)`,
      })
      .from(kommoUserMap)
      .leftJoin(kommoLeads, eq(kommoLeads.kommoUserId, kommoUserMap.kommoUserId))
      .leftJoin(usuarios, eq(usuarios.id, kommoUserMap.usuarioId))
      .where(inArray(usuarios.lojaId, lojaIds))
      .groupBy(kommoUserMap.kommoUserId, kommoUserMap.usuarioId, usuarios.nome, kommoUserMap.nomeKommo),
    db
      .select({
        kommoUserId: kommoAtividadeDiaria.kommoUserId,
        mensagens: sql<number>`coalesce(sum(${kommoAtividadeDiaria.mensagens}), 0)`,
        tarefas: sql<number>`coalesce(sum(${kommoAtividadeDiaria.tarefas}), 0)`,
        // Tempo típico = média das medianas diárias, ponderada pela qtd de respostas
        respSoma: sql<number>`coalesce(sum(${kommoAtividadeDiaria.respMedianaSeg} * ${kommoAtividadeDiaria.respQtd}), 0)`,
        respQtd: sql<number>`coalesce(sum(${kommoAtividadeDiaria.respQtd}), 0)`,
      })
      .from(kommoAtividadeDiaria)
      .where(and(gte(kommoAtividadeDiaria.dia, deStr), lte(kommoAtividadeDiaria.dia, ateStr)))
      .groupBy(kommoAtividadeDiaria.kommoUserId),
  ])

  const ativ = new Map(ativRows.map(a => {
    const qtd = Number(a.respQtd) || 0
    return [a.kommoUserId, {
      mensagens: Number(a.mensagens) || 0,
      tarefas: Number(a.tarefas) || 0,
      tempoRespSeg: qtd ? (Number(a.respSoma) || 0) / qtd : null,
    }]
  }))

  return leadsRows
    .map(r => {
      const volume = Number(r.volume) || 0
      const ganhos = Number(r.ganhos) || 0
      const a = ativ.get(r.kommoUserId)
      return {
        usuarioId: r.usuarioId,
        kommoUserId: r.kommoUserId,
        nome: r.nomeMova ?? r.nomeKommo ?? '—',
        vinculado: !!r.usuarioId,
        volume,
        ganhos,
        perdidos: Number(r.perdidos) || 0,
        valor: Number(r.valor) || 0,
        ganhosSemValor: Number(r.ganhosSemValor) || 0,
        conversao: volume ? ganhos / volume : 0,
        mensagens: a?.mensagens ?? 0,
        tarefas: a?.tarefas ?? 0,
        tempoRespSeg: a?.tempoRespSeg ?? null,
      }
    })
    .sort((a, b) => b.volume - a.volume)
}
