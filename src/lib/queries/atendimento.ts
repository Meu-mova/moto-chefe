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
  semResposta: number
  comIncoming: number
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
        semResposta: sql<number>`count(*) filter (where ${kommoLeads.primeiroIncomingEm} is not null and ${kommoLeads.primeiraRespostaEm} is null and ${kommoLeads.criadoEm} >= ${iniIso} and ${kommoLeads.criadoEm} <= ${fimIso})`,
        comIncoming: sql<number>`count(*) filter (where ${kommoLeads.primeiroIncomingEm} is not null and ${kommoLeads.criadoEm} >= ${iniIso} and ${kommoLeads.criadoEm} <= ${fimIso})`,
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
        semResposta: Number(r.semResposta) || 0,
        comIncoming: Number(r.comIncoming) || 0,
      }
    })
    .sort((a, b) => b.volume - a.volume)
}

// Meta de conversão de leads (7%). Se virar configurável, mover pra grupos/config.
export const KOMMO_META_CONVERSAO = 0.07

// Placar do vendedor pro dashboard: os números dele + posição no ranking do grupo.
export async function placarVendedor(usuarioId: string, inicio: Date, fim: Date, deStr: string, ateStr: string, lojaIds: string[]) {
  const rows = await metricasAtendimento(inicio, fim, deStr, ateStr, lojaIds)
  const linha = rows.find(r => r.usuarioId === usuarioId)
  if (!linha) return null
  // Ranking por conversão (desc), só quem teve leads no período
  const ranking = rows.filter(r => r.volume > 0).sort((a, b) => b.conversao - a.conversao)
  const idx = ranking.findIndex(r => r.usuarioId === usuarioId)
  return {
    linha,
    posicao: idx >= 0 ? idx + 1 : null,
    total: ranking.length,
    meta: KOMMO_META_CONVERSAO,
  }
}

// SLA de 1ª resposta (horário comercial 8h–18h BRT): distribuição por faixa,
// sobre leads criados no período do grupo que tiveram 1ª mensagem do cliente.
export async function slaAtendimento(inicio: Date, fim: Date, lojaIds: string[]) {
  if (lojaIds.length === 0) return { sla5: 0, sla15: 0, sla60: 0, slaMais: 0, semResposta: 0, respondidos: 0 }
  const rows = await db.execute(sql`
    SELECT
      count(*) filter (where dt < 300)                as sla5,
      count(*) filter (where dt >= 300 and dt < 900)  as sla15,
      count(*) filter (where dt >= 900 and dt < 3600) as sla60,
      count(*) filter (where dt >= 3600)              as slamais,
      count(*) filter (where dt is null)              as semresposta
    FROM (
      SELECT extract(epoch from (l.primeira_resposta_em - l.primeiro_incoming_em)) as dt
      FROM kommo_leads l
      JOIN kommo_user_map k ON k.kommo_user_id = l.kommo_user_id
      JOIN usuarios u ON u.id = k.usuario_id
      WHERE l.primeiro_incoming_em is not null
        AND l.criado_em >= ${inicio.toISOString()} AND l.criado_em <= ${fim.toISOString()}
        AND u.loja_id in ${lojaIds}
        AND extract(hour from l.primeiro_incoming_em at time zone 'America/Sao_Paulo') between 8 and 17
    ) s
  `) as unknown as { sla5: number; sla15: number; sla60: number; slamais: number; semresposta: number }[]
  const r = rows[0] ?? { sla5: 0, sla15: 0, sla60: 0, slamais: 0, semresposta: 0 }
  const sla5 = Number(r.sla5) || 0, sla15 = Number(r.sla15) || 0, sla60 = Number(r.sla60) || 0, slaMais = Number(r.slamais) || 0
  return { sla5, sla15, sla60, slaMais, semResposta: Number(r.semresposta) || 0, respondidos: sla5 + sla15 + sla60 + slaMais }
}

// Motivos de perda no período (leads perdidos fechados no período), do grupo.
export async function motivosDePerda(inicio: Date, fim: Date, lojaIds: string[]) {
  if (lojaIds.length === 0) return { motivos: [] as { motivo: string; qtd: number }[], total: 0, semMotivo: 0 }
  const rows = await db.execute(sql`
    SELECT coalesce(r.nome, '(não informado)') as motivo, count(*)::int as qtd,
           bool_or(l.loss_reason_id is null) as vazio
    FROM kommo_leads l
    JOIN kommo_user_map k ON k.kommo_user_id = l.kommo_user_id
    JOIN usuarios u ON u.id = k.usuario_id
    LEFT JOIN kommo_loss_reasons r ON r.id = l.loss_reason_id
    WHERE l.status_id = 143 AND l.fechado_em >= ${inicio.toISOString()} AND l.fechado_em <= ${fim.toISOString()}
      AND u.loja_id in ${lojaIds}
    GROUP BY coalesce(r.nome, '(não informado)')
    ORDER BY qtd DESC
  `) as unknown as { motivo: string; qtd: number; vazio: boolean }[]
  const lista = rows.map(x => ({ motivo: x.motivo, qtd: Number(x.qtd) || 0, vazio: !!x.vazio }))
  const total = lista.reduce((a, m) => a + m.qtd, 0)
  const semMotivo = lista.filter(m => m.vazio).reduce((a, m) => a + m.qtd, 0)
  return { motivos: lista.map(({ motivo, qtd }) => ({ motivo, qtd })), total, semMotivo }
}
