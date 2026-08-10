import { db, execRows } from '@/lib/db'
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

// SLA de 1ª resposta (horário comercial 8h–18h BRT): distribuição por faixa,
// sobre leads criados no período do grupo que tiveram 1ª mensagem do cliente.
export async function slaAtendimento(inicio: Date, fim: Date, lojaIds: string[]) {
  if (lojaIds.length === 0) return { sla5: 0, sla15: 0, sla60: 0, slaMais: 0, semResposta: 0, respondidos: 0 }
  const rows = await execRows(sql`
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

  const rows = await execRows(sql`
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

// ─── Painel de atendimento (dashboard) ───────────────────────────────────────

// Tempo até a 1ª resposta do lead: primeiro_incoming_em → primeira_resposta_em.
// É diferente do `tempoRespSeg` da atividade diária, que é a mediana de TODAS as
// respostas do dia (o ciclo reseta a cada mensagem do cliente). Só conta lead que
// chegou em horário comercial (8h–17h BRT), mesmo recorte do slaAtendimento.
export async function tempoPrimeiraResposta(inicio: Date, fim: Date, lojaIds: string[], usuarioId?: string) {
  const vazio = { medianaSeg: null as number | null, p90Seg: null as number | null, qtd: 0 }
  if (lojaIds.length === 0) return vazio
  const rows = await execRows(sql`
    SELECT
      percentile_cont(0.5) WITHIN GROUP (ORDER BY dt)::float8 as mediana,
      percentile_cont(0.9) WITHIN GROUP (ORDER BY dt)::float8 as p90,
      count(*)::int as qtd
    FROM (
      SELECT extract(epoch from (l.primeira_resposta_em - l.primeiro_incoming_em)) as dt
      FROM kommo_leads l
      JOIN kommo_user_map k ON k.kommo_user_id = l.kommo_user_id
      JOIN usuarios u ON u.id = k.usuario_id
      WHERE l.primeiro_incoming_em is not null
        AND l.primeira_resposta_em is not null
        AND l.primeira_resposta_em >= l.primeiro_incoming_em
        AND l.criado_em >= ${inicio.toISOString()} AND l.criado_em <= ${fim.toISOString()}
        AND u.loja_id in ${lojaIds}
        AND extract(hour from l.primeiro_incoming_em at time zone 'America/Sao_Paulo') between 8 and 17
        ${usuarioId ? sql`AND k.usuario_id = ${usuarioId}` : sql``}
    ) s
  `) as unknown as { mediana: number | null; p90: number | null; qtd: number }[]
  const r = rows[0]
  if (!r || !Number(r.qtd)) return vazio
  return { medianaSeg: r.mediana == null ? null : Number(r.mediana), p90Seg: r.p90 == null ? null : Number(r.p90), qtd: Number(r.qtd) }
}

// Atividade agregada do período, já restrita ao grupo (a kommo_atividade_diaria
// não tem loja; o vínculo vem do kommo_user_map). Tempo médio de resposta =
// média das medianas diárias ponderada pela quantidade de respostas do dia.
export async function atividadeAgregada(deStr: string, ateStr: string, lojaIds: string[], usuarioId?: string) {
  const vazio = { mensagens: 0, tarefasConcluidas: 0, tempoMedioRespSeg: null as number | null, respQtd: 0 }
  if (lojaIds.length === 0) return vazio
  const rows = await execRows(sql`
    SELECT
      coalesce(sum(a.mensagens), 0)::int                      as mensagens,
      coalesce(sum(a.tarefas), 0)::int                        as tarefas_concluidas,
      coalesce(sum(a.resp_mediana_seg * a.resp_qtd), 0)::float8 as resp_soma,
      coalesce(sum(a.resp_qtd), 0)::int                       as resp_qtd
    FROM kommo_atividade_diaria a
    JOIN kommo_user_map k ON k.kommo_user_id = a.kommo_user_id
    JOIN usuarios u       ON u.id = k.usuario_id
    WHERE a.dia >= ${deStr} AND a.dia <= ${ateStr}
      AND u.loja_id in ${lojaIds}
      ${usuarioId ? sql`AND k.usuario_id = ${usuarioId}` : sql``}
  `) as unknown as { mensagens: number; tarefas_concluidas: number; resp_soma: number; resp_qtd: number }[]
  const r = rows[0]
  if (!r) return vazio
  const qtd = Number(r.resp_qtd) || 0
  return {
    mensagens: Number(r.mensagens) || 0,
    tarefasConcluidas: Number(r.tarefas_concluidas) || 0,
    tempoMedioRespSeg: qtd ? (Number(r.resp_soma) || 0) / qtd : null,
    respQtd: qtd,
  }
}

// Tarefas do Kommo ainda abertas (o sync só traz is_completed=0). Atrasada =
// prazo já passou. Tarefa sem responsável cai no dono do lead. Ignora tarefa
// pendurada em lead já ganho/perdido — o vendedor não tem o que fazer nela.
export async function tarefasKommo(lojaIds: string[], usuarioId?: string) {
  const vazio = { abertas: 0, atrasadas: 0, vencemHoje: 0, maiorAtrasoDias: 0 }
  if (lojaIds.length === 0) return vazio
  const rows = await execRows(sql`
    SELECT
      count(*)::int                                                              as abertas,
      count(*) filter (where t.prazo < now())::int                               as atrasadas,
      count(*) filter (where t.prazo >= now() and t.prazo < now() + interval '1 day')::int as vencem_hoje,
      coalesce(max(floor(extract(epoch from (now() - t.prazo)) / 86400)) filter (where t.prazo < now()), 0)::int as maior_atraso_dias
    FROM kommo_tarefas_abertas t
    LEFT JOIN kommo_leads l ON l.lead_id = t.lead_id
    JOIN kommo_user_map k   ON k.kommo_user_id = coalesce(t.kommo_user_id, l.kommo_user_id)
    JOIN usuarios u         ON u.id = k.usuario_id
    WHERE u.loja_id in ${lojaIds}
      AND (l.status_id is null or l.status_id not in (142, 143))
      ${usuarioId ? sql`AND k.usuario_id = ${usuarioId}` : sql``}
  `) as unknown as { abertas: number; atrasadas: number; vencem_hoje: number; maior_atraso_dias: number }[]
  const r = rows[0]
  if (!r) return vazio
  return {
    abertas: Number(r.abertas) || 0,
    atrasadas: Number(r.atrasadas) || 0,
    vencemHoje: Number(r.vencem_hoje) || 0,
    maiorAtrasoDias: Number(r.maior_atraso_dias) || 0,
  }
}

export type MotivoCritico = 'sem_resposta' | 'tarefa_atrasada' | 'parado_sem_tarefa'

export type LeadCritico = {
  leadId: number
  nome: string
  etapa: string
  valor: number
  colaborador: string
  motivo: MotivoCritico
  dias: number
}

// Quantos dias um lead sem resposta ainda conta como crítico. Sem esse corte o
// topo da lista vira cemitério de lead antigo e o vendedor nunca zera o alerta —
// passou de duas semanas sem retorno, o lead está perdido, não crítico.
const JANELA_SEM_RESPOSTA_DIAS = 14

// Gravidade: cliente esperando resposta é o pior (o lead nem começou), depois
// tarefa que já venceu, depois lead prestes a fechar sem próximo passo marcado.
const PESO: Record<MotivoCritico, number> = { sem_resposta: 0, tarefa_atrasada: 1, parado_sem_tarefa: 2 }

// Foto do AGORA (ignora o período do filtro): leads abertos que precisam de ação.
// `limite` corta só a lista exibida — as contagens e o valor em risco são do
// conjunto inteiro. Um lead entra uma vez só, pelo motivo mais grave.
export async function leadsCriticos(lojaIds: string[], usuarioId?: string, limite = 12) {
  const vazio = {
    leads: [] as LeadCritico[],
    total: 0, semResposta: 0, tarefaAtrasada: 0, paradoSemTarefa: 0, valorEmRisco: 0,
  }
  if (lojaIds.length === 0) return vazio

  const rows = await execRows(sql`
    WITH tar AS (
      SELECT lead_id, min(prazo) as prazo_min
      FROM kommo_tarefas_abertas
      GROUP BY lead_id
    )
    SELECT
      l.lead_id                                   as lead_id,
      coalesce(nullif(l.nome, ''), '(sem nome)')  as nome,
      coalesce(s.nome, '—')                       as etapa,
      l.price::float8                             as valor,
      coalesce(u.nome, k.nome_kommo, '—')         as colaborador,
      (l.primeiro_incoming_em is not null
        and l.primeira_resposta_em is null
        and l.primeiro_incoming_em >= now() - make_interval(days => ${JANELA_SEM_RESPOSTA_DIAS})) as sem_resposta,
      greatest(0, floor(extract(epoch from (now() - l.primeiro_incoming_em)) / 86400))::int as dias_espera,
      (t.prazo_min is not null and t.prazo_min < now())                                     as tarefa_atrasada,
      greatest(0, floor(extract(epoch from (now() - t.prazo_min)) / 86400))::int            as dias_atraso,
      (coalesce(s.etapa_fechamento, false) and t.lead_id is null)                           as parado_sem_tarefa,
      greatest(0, floor(extract(epoch from (now() - coalesce(l.atualizado_em, l.criado_em, now()))) / 86400))::int as dias_parado
    FROM kommo_leads l
    JOIN kommo_user_map k ON k.kommo_user_id = l.kommo_user_id
    JOIN usuarios u       ON u.id = k.usuario_id
    LEFT JOIN kommo_stages s ON s.status_id = l.status_id
    LEFT JOIN tar t          ON t.lead_id = l.lead_id
    WHERE u.loja_id in ${lojaIds}
      AND (l.status_id is null or l.status_id not in (142, 143))
      ${usuarioId ? sql`AND k.usuario_id = ${usuarioId}` : sql``}
      AND (
        (l.primeiro_incoming_em is not null
          and l.primeira_resposta_em is null
          and l.primeiro_incoming_em >= now() - make_interval(days => ${JANELA_SEM_RESPOSTA_DIAS}))
        OR (t.prazo_min is not null and t.prazo_min < now())
        OR (coalesce(s.etapa_fechamento, false) and t.lead_id is null)
      )
  `) as unknown as {
    lead_id: number; nome: string; etapa: string; valor: number; colaborador: string
    sem_resposta: boolean; dias_espera: number
    tarefa_atrasada: boolean; dias_atraso: number
    parado_sem_tarefa: boolean; dias_parado: number
  }[]

  const leads: LeadCritico[] = rows.map(r => {
    const motivo: MotivoCritico = r.sem_resposta ? 'sem_resposta' : r.tarefa_atrasada ? 'tarefa_atrasada' : 'parado_sem_tarefa'
    const dias = motivo === 'sem_resposta' ? r.dias_espera : motivo === 'tarefa_atrasada' ? r.dias_atraso : r.dias_parado
    return {
      leadId: Number(r.lead_id),
      nome: r.nome,
      etapa: r.etapa,
      valor: Number(r.valor) || 0,
      colaborador: r.colaborador,
      motivo,
      dias: Number(dias) || 0,
    }
  })

  leads.sort((a, b) => PESO[a.motivo] - PESO[b.motivo] || b.dias - a.dias || b.valor - a.valor)

  return {
    leads: leads.slice(0, limite),
    total: leads.length,
    semResposta: leads.filter(l => l.motivo === 'sem_resposta').length,
    tarefaAtrasada: leads.filter(l => l.motivo === 'tarefa_atrasada').length,
    paradoSemTarefa: leads.filter(l => l.motivo === 'parado_sem_tarefa').length,
    valorEmRisco: leads.reduce((a, l) => a + l.valor, 0),
  }
}

export type CardsAtendimento = {
  escopo: 'vendedor' | 'grupo'
  nome: string
  volume: number
  ganhos: number
  conversao: number
  meta: number
  posicao: number | null
  totalRanking: number
  colaboradores: number
  semResposta: number
  comIncoming: number
  primeiraRespMedianaSeg: number | null
  primeiraRespP90Seg: number | null
  primeiraRespQtd: number
  tempoMedioRespSeg: number | null
  mensagens: number
  tarefasConcluidas: number
  tarefasAbertas: number
  tarefasAtrasadas: number
  tarefasVencemHoje: number
  maiorAtrasoDias: number
  criticos: number
  valorEmRisco: number
}

// Painel do dashboard. `usuarioId` definido = visão do vendedor (números dele +
// posição no ranking do grupo); sem ele = visão consolidada do grupo.
// Devolve null quando não há nada a mostrar (vendedor sem vínculo no Kommo).
export async function painelAtendimento(opts: {
  lojaIds: string[]
  inicio: Date; fim: Date; deStr: string; ateStr: string
  usuarioId?: string
  limiteCriticos?: number
}): Promise<{ cards: CardsAtendimento; criticos: Awaited<ReturnType<typeof leadsCriticos>> } | null> {
  const { lojaIds, inicio, fim, deStr, ateStr, usuarioId } = opts
  if (lojaIds.length === 0) return null

  const [linhas, resp, ativ, tarefas, criticos] = await Promise.all([
    metricasAtendimento(inicio, fim, deStr, ateStr, lojaIds),
    tempoPrimeiraResposta(inicio, fim, lojaIds, usuarioId),
    atividadeAgregada(deStr, ateStr, lojaIds, usuarioId),
    tarefasKommo(lojaIds, usuarioId),
    leadsCriticos(lojaIds, usuarioId, opts.limiteCriticos ?? 12),
  ])

  const ranking = linhas.filter(r => r.volume > 0).sort((a, b) => b.conversao - a.conversao)

  let base: { nome: string; volume: number; ganhos: number; semResposta: number; comIncoming: number }
  let posicao: number | null = null
  if (usuarioId) {
    const linha = linhas.find(r => r.usuarioId === usuarioId)
    if (!linha) return null
    const idx = ranking.findIndex(r => r.usuarioId === usuarioId)
    posicao = idx >= 0 ? idx + 1 : null
    base = linha
  } else {
    // Grupo sem ninguém mapeado no Kommo: não há painel a mostrar.
    if (linhas.length === 0) return null
    base = {
      nome: 'Grupo',
      volume: linhas.reduce((a, r) => a + r.volume, 0),
      ganhos: linhas.reduce((a, r) => a + r.ganhos, 0),
      semResposta: linhas.reduce((a, r) => a + r.semResposta, 0),
      comIncoming: linhas.reduce((a, r) => a + r.comIncoming, 0),
    }
  }

  return {
    cards: {
      escopo: usuarioId ? 'vendedor' : 'grupo',
      nome: base.nome,
      volume: base.volume,
      ganhos: base.ganhos,
      conversao: base.volume ? base.ganhos / base.volume : 0,
      meta: KOMMO_META_CONVERSAO,
      posicao,
      totalRanking: ranking.length,
      colaboradores: linhas.length,
      semResposta: base.semResposta,
      comIncoming: base.comIncoming,
      primeiraRespMedianaSeg: resp.medianaSeg,
      primeiraRespP90Seg: resp.p90Seg,
      primeiraRespQtd: resp.qtd,
      tempoMedioRespSeg: ativ.tempoMedioRespSeg,
      mensagens: ativ.mensagens,
      tarefasConcluidas: ativ.tarefasConcluidas,
      tarefasAbertas: tarefas.abertas,
      tarefasAtrasadas: tarefas.atrasadas,
      tarefasVencemHoje: tarefas.vencemHoje,
      maiorAtrasoDias: tarefas.maiorAtrasoDias,
      criticos: criticos.total,
      valorEmRisco: criticos.valorEmRisco,
    },
    criticos,
  }
}

// Funis em que nenhuma etapa casou com "interesse"/"negocia" — provavelmente
// etapa renomeada no Kommo. Alimenta o aviso na página Atendimento.
export async function funisSemEtapaDetectada(): Promise<string[]> {
  const rows = await execRows(sql`
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
  const rows = await execRows(sql`
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
