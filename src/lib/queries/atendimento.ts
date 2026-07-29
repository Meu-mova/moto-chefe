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

export type LeadDescoberto = {
  leadId: number
  nome: string
  etapa: string
  valor: number
  dias: number
  colaborador: string
}

export type FechamentoColaborador = {
  usuarioId: string | null
  kommoUserId: string
  nome: string
  naEtapa: number
  semTarefa: number
  valorParado: number
  cobertura: number
  leads: LeadDescoberto[]   // só os `limite` mais parados; a contagem cheia é semTarefa
}

// Foto do AGORA (ignora período): leads parados nas etapas finais do funil
// ("tem interesse" / "em negociação") sem nenhuma tarefa em aberto. Tarefa
// vencida conta como coberta. Filtra pelo grupo ativo via usuarios.loja_id.
// `limite` corta só a LISTA exibida (os 20 mais parados) — as contagens e o
// valor parado são sempre do conjunto inteiro.
export async function fechamentoSemTarefa(lojaIds: string[], usuarioId?: string, limite = 20) {
  const vazio = {
    porColaborador: [] as FechamentoColaborador[],
    naEtapa: 0, semTarefa: 0, valorParado: 0, cobertura: 1,
    leads: [] as LeadDescoberto[],
  }
  if (lojaIds.length === 0) return vazio

  const rows = await db.execute(sql`
    SELECT
      l.lead_id                                   as lead_id,
      coalesce(nullif(l.nome, ''), '(sem nome)')  as nome,
      s.nome                                      as etapa,
      l.price::float8                             as valor,
      greatest(0, floor(extract(epoch from (now() - coalesce(l.atualizado_em, l.criado_em, now()))) / 86400))::int as dias,
      k.kommo_user_id                             as kommo_user_id,
      k.usuario_id                                as usuario_id,
      coalesce(u.nome, k.nome_kommo, '—')         as colaborador,
      (t.id is not null)                          as tem_tarefa
    FROM kommo_leads l
    JOIN kommo_stages s   ON s.status_id = l.status_id AND s.etapa_fechamento
    JOIN kommo_user_map k ON k.kommo_user_id = l.kommo_user_id
    JOIN usuarios u       ON u.id = k.usuario_id
    LEFT JOIN LATERAL (SELECT id FROM kommo_tarefas_abertas ta WHERE ta.lead_id = l.lead_id LIMIT 1) t ON true
    WHERE u.loja_id in ${lojaIds}
      ${usuarioId ? sql`AND k.usuario_id = ${usuarioId}` : sql``}
    ORDER BY dias DESC
  `) as unknown as {
    lead_id: number; nome: string; etapa: string; valor: number; dias: number
    kommo_user_id: string; usuario_id: string | null; colaborador: string; tem_tarefa: boolean
  }[]

  const porUser = new Map<string, FechamentoColaborador>()
  for (const r of rows) {
    const c = porUser.get(r.kommo_user_id) ?? {
      usuarioId: r.usuario_id, kommoUserId: r.kommo_user_id, nome: r.colaborador,
      naEtapa: 0, semTarefa: 0, valorParado: 0, cobertura: 1, leads: [],
    }
    c.naEtapa += 1
    if (!r.tem_tarefa) {
      c.semTarefa += 1
      c.valorParado += Number(r.valor) || 0
      // rows já vem ordenado por dias desc — os primeiros são os mais parados
      if (c.leads.length < limite) {
        c.leads.push({
          leadId: Number(r.lead_id),
          nome: r.nome,
          etapa: r.etapa,
          valor: Number(r.valor) || 0,
          dias: Number(r.dias) || 0,
          colaborador: r.colaborador,
        })
      }
    }
    porUser.set(r.kommo_user_id, c)
  }

  const porColaborador = [...porUser.values()]
    .map(c => ({ ...c, cobertura: c.naEtapa ? (c.naEtapa - c.semTarefa) / c.naEtapa : 1 }))
    .sort((a, b) => b.semTarefa - a.semTarefa)

  const naEtapa = porColaborador.reduce((a, c) => a + c.naEtapa, 0)
  const semTarefa = porColaborador.reduce((a, c) => a + c.semTarefa, 0)
  return {
    porColaborador,
    naEtapa,
    semTarefa,
    valorParado: porColaborador.reduce((a, c) => a + c.valorParado, 0),
    cobertura: naEtapa ? (naEtapa - semTarefa) / naEtapa : 1,
    leads: porColaborador.flatMap(c => c.leads).sort((a, b) => b.dias - a.dias).slice(0, limite),
  }
}

// Funis em que nenhuma etapa casou com "interesse"/"negocia" — provavelmente
// etapa renomeada no Kommo. Alimenta o aviso na página Atendimento.
export async function funisSemEtapaDetectada(): Promise<string[]> {
  const rows = await db.execute(sql`
    SELECT coalesce(pipeline_nome, '(sem nome)') as funil
    FROM kommo_stages
    GROUP BY pipeline_id, pipeline_nome
    HAVING bool_or(etapa_fechamento) = false
    ORDER BY 1
  `) as unknown as { funil: string }[]
  return rows.map(r => r.funil)
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
