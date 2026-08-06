import { execRows } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { rotuloCanal, taxa } from '@/lib/marketing-canal'

// Relatório de Marketing — leads de ENTRADA do Kommo.
// Ver docs/superpowers/specs/2026-08-06-marketing-leads-kommo-design.md
//
// Duas diferenças propositais em relação a queries/atendimento.ts:
//  1. O grupo vem do FUNIL (kommo_pipeline_grupo), não do vendedor responsável.
//     O funil está preenchido em 100% dos leads; o vendedor, não — pela regra
//     antiga ~13% da entrada ficava invisível.
//  2. Conversão é por COORTE: dos leads que entraram no período, quantos já
//     foram ganhos. É o que julga campanha. A tela de Atendimento compara
//     coortes distintas de propósito (gestão de vendedor, não de mídia).
//
// Cuidado conhecido do repo: nunca passar Date cru dentro de sql`` — o
// postgres.js com prepare:false estoura em runtime e o tsc não pega.

const GANHO = 142
const PERDIDO = 143

// Início/fim do dia em BRT, já como string ISO para o driver.
function janela(de: string, ate: string) {
  return { ini: `${de}T00:00:00-03:00`, fim: `${ate}T23:59:59-03:00` }
}

// Nome do funil a partir de kommo_stages. Tem de ser DEDUPLICADO: a tabela é de
// etapas (dezenas por funil), então juntar direto multiplica cada lead pelo
// número de etapas — leads e faturamento saem inflados sem nenhum erro visível.
const FUNIS = sql`
  funis AS (
    SELECT pipeline_id, min(pipeline_nome) AS pipeline_nome
    FROM kommo_stages GROUP BY pipeline_id
  )`

export type ResumoMarketing = {
  leads: number
  ganhos: number
  perdidos: number
  emAberto: number
  faturamento: number
  ganhosSemValor: number
  semCanal: number
  conversao: number
  ticket: number
}

export async function resumoMarketing(grupoId: string, de: string, ate: string): Promise<ResumoMarketing> {
  const { ini, fim } = janela(de, ate)
  const rows = await execRows(sql`
    SELECT
      count(*)::int                                            as leads,
      count(*) filter (where l.status_id = ${GANHO})::int       as ganhos,
      count(*) filter (where l.status_id = ${PERDIDO})::int     as perdidos,
      count(*) filter (where l.source_id is null)::int          as sem_canal,
      count(*) filter (where l.status_id = ${GANHO} and l.price = 0)::int as ganhos_sem_valor,
      coalesce(sum(l.price) filter (where l.status_id = ${GANHO}), 0)::float8 as faturamento
    FROM kommo_leads l
    JOIN kommo_pipeline_grupo pg ON pg.pipeline_id = l.pipeline_id
    WHERE pg.grupo_id = ${grupoId}
      AND l.criado_em >= ${ini} AND l.criado_em <= ${fim}
  `) as unknown as {
    leads: number; ganhos: number; perdidos: number
    sem_canal: number; ganhos_sem_valor: number; faturamento: number
  }[]
  const r = rows[0] ?? { leads: 0, ganhos: 0, perdidos: 0, sem_canal: 0, ganhos_sem_valor: 0, faturamento: 0 }
  const leads = Number(r.leads) || 0
  const ganhos = Number(r.ganhos) || 0
  const perdidos = Number(r.perdidos) || 0
  const faturamento = Number(r.faturamento) || 0
  return {
    leads,
    ganhos,
    perdidos,
    emAberto: leads - ganhos - perdidos,
    faturamento,
    ganhosSemValor: Number(r.ganhos_sem_valor) || 0,
    semCanal: Number(r.sem_canal) || 0,
    conversao: taxa(ganhos, leads),
    ticket: ganhos > 0 ? faturamento / ganhos : 0,
  }
}

export type LinhaCanal = {
  sourceId: number | null
  canal: string
  plataforma: string | null
  leads: number
  ganhos: number
  perdidos: number
  conversao: number
  faturamento: number
  ticket: number
  participacao: number
  semResposta: number
  comIncoming: number
}

export async function leadsPorCanal(grupoId: string, de: string, ate: string): Promise<LinhaCanal[]> {
  const { ini, fim } = janela(de, ate)
  const rows = await execRows(sql`
    SELECT
      l.source_id                                              as source_id,
      max(s.origem)                                            as origem,
      max(s.perfil)                                            as perfil,
      max(s.nome)                                              as nome,
      count(*)::int                                            as leads,
      count(*) filter (where l.status_id = ${GANHO})::int       as ganhos,
      count(*) filter (where l.status_id = ${PERDIDO})::int     as perdidos,
      coalesce(sum(l.price) filter (where l.status_id = ${GANHO}), 0)::float8 as faturamento,
      count(*) filter (where l.primeiro_incoming_em is not null)::int as com_incoming,
      count(*) filter (where l.primeiro_incoming_em is not null
                         and l.primeira_resposta_em is null)::int     as sem_resposta
    FROM kommo_leads l
    JOIN kommo_pipeline_grupo pg ON pg.pipeline_id = l.pipeline_id
    LEFT JOIN kommo_sources s ON s.source_id = l.source_id
    WHERE pg.grupo_id = ${grupoId}
      AND l.criado_em >= ${ini} AND l.criado_em <= ${fim}
    GROUP BY l.source_id
    ORDER BY leads DESC
  `) as unknown as {
    source_id: number | null; origem: string | null; perfil: string | null; nome: string | null
    leads: number; ganhos: number; perdidos: number; faturamento: number
    com_incoming: number; sem_resposta: number
  }[]

  const total = rows.reduce((a, r) => a + (Number(r.leads) || 0), 0)
  return rows.map(r => {
    const leads = Number(r.leads) || 0
    const ganhos = Number(r.ganhos) || 0
    const faturamento = Number(r.faturamento) || 0
    const sourceId = r.source_id != null ? Number(r.source_id) : null
    return {
      sourceId,
      canal: rotuloCanal({ sourceId, origem: r.origem, perfil: r.perfil, nome: r.nome }),
      plataforma: r.origem ?? null,
      leads,
      ganhos,
      perdidos: Number(r.perdidos) || 0,
      conversao: taxa(ganhos, leads),
      faturamento,
      ticket: ganhos > 0 ? faturamento / ganhos : 0,
      participacao: taxa(leads, total),
      semResposta: Number(r.sem_resposta) || 0,
      comIncoming: Number(r.com_incoming) || 0,
    }
  })
}

export type LinhaFunil = {
  pipelineId: string
  funil: string
  leads: number
  ganhos: number
  conversao: number
  faturamento: number
  investimento: number
}

// Verba do período. O lançamento é mensal; quando o filtro pega mês parcial,
// rateia pela fração de dias sobrepostos — senão meio mês de campanha apareceria
// com a verba do mês inteiro e o CPL sairia dobrado.
//   fração = (sobreposição do mês com o período) / (duração do mês)
function verbaRateada(ini: string, fim: string) {
  return sql`
    i.valor::float8
    * GREATEST(0, EXTRACT(epoch FROM (
        LEAST((i.mes + interval '1 month')::timestamptz, ${fim}::timestamptz)
        - GREATEST(i.mes::timestamptz, ${ini}::timestamptz))))
    / EXTRACT(epoch FROM ((i.mes + interval '1 month')::timestamptz - i.mes::timestamptz))`
}

// Só os lançamentos cujo mês encosta no período.
function mesNoPeriodo(ini: string, fim: string) {
  return sql`i.mes::timestamptz < ${fim}::timestamptz
             AND (i.mes + interval '1 month')::timestamptz > ${ini}::timestamptz`
}

// Chave '' = verba lançada sem funil (do grupo inteiro).
export async function investimentoPorFunil(grupoId: string, de: string, ate: string) {
  const { ini, fim } = janela(de, ate)
  const rows = await execRows(sql`
    SELECT coalesce(i.pipeline_id, '') as pipeline_id, sum(${verbaRateada(ini, fim)})::float8 as valor
    FROM marketing_investimento i
    WHERE i.grupo_id = ${grupoId} AND ${mesNoPeriodo(ini, fim)}
    GROUP BY 1
  `) as unknown as { pipeline_id: string; valor: number }[]
  return new Map(rows.map(r => [r.pipeline_id, Number(r.valor) || 0]))
}

export async function investimentoPorPlataforma(grupoId: string, de: string, ate: string) {
  const { ini, fim } = janela(de, ate)
  const rows = await execRows(sql`
    SELECT i.plataforma as plataforma, sum(${verbaRateada(ini, fim)})::float8 as valor
    FROM marketing_investimento i
    WHERE i.grupo_id = ${grupoId} AND ${mesNoPeriodo(ini, fim)}
    GROUP BY 1 ORDER BY 2 DESC
  `) as unknown as { plataforma: string; valor: number }[]
  return rows.map(r => ({ plataforma: r.plataforma, valor: Number(r.valor) || 0 }))
}

export async function leadsPorFunil(grupoId: string, de: string, ate: string): Promise<LinhaFunil[]> {
  const { ini, fim } = janela(de, ate)
  const [rows, verba] = await Promise.all([
    execRows(sql`
      WITH ${FUNIS}
      SELECT l.pipeline_id                                       as pipeline_id,
             coalesce(max(f.pipeline_nome), l.pipeline_id)        as funil,
             count(*)::int                                        as leads,
             count(*) filter (where l.status_id = ${GANHO})::int   as ganhos,
             coalesce(sum(l.price) filter (where l.status_id = ${GANHO}), 0)::float8 as faturamento
      FROM kommo_leads l
      JOIN kommo_pipeline_grupo pg ON pg.pipeline_id = l.pipeline_id
      LEFT JOIN funis f ON f.pipeline_id = l.pipeline_id
      WHERE pg.grupo_id = ${grupoId}
        AND l.criado_em >= ${ini} AND l.criado_em <= ${fim}
      GROUP BY l.pipeline_id
      ORDER BY leads DESC
    `) as unknown as Promise<{ pipeline_id: string; funil: string; leads: number; ganhos: number; faturamento: number }[]>,
    investimentoPorFunil(grupoId, de, ate),
  ])

  return rows.map(r => {
    const leads = Number(r.leads) || 0
    const ganhos = Number(r.ganhos) || 0
    return {
      pipelineId: r.pipeline_id,
      funil: r.funil,
      leads,
      ganhos,
      conversao: taxa(ganhos, leads),
      faturamento: Number(r.faturamento) || 0,
      investimento: verba.get(r.pipeline_id) ?? 0,
    }
  })
}

// Série de entrada. `gran` = 'dia' | 'mes' (período longo vira serrote ilegível).
export async function serieEntrada(grupoId: string, de: string, ate: string, gran: 'dia' | 'mes') {
  const { ini, fim } = janela(de, ate)
  const trunc = gran === 'mes' ? sql.raw("'month'") : sql.raw("'day'")
  const rows = await execRows(sql`
    SELECT to_char(date_trunc(${trunc}, l.criado_em AT TIME ZONE 'America/Sao_Paulo'), 'YYYY-MM-DD') as periodo,
           count(*)::int                                       as leads,
           count(*) filter (where l.status_id = ${GANHO})::int   as ganhos
    FROM kommo_leads l
    JOIN kommo_pipeline_grupo pg ON pg.pipeline_id = l.pipeline_id
    WHERE pg.grupo_id = ${grupoId}
      AND l.criado_em >= ${ini} AND l.criado_em <= ${fim}
    GROUP BY 1 ORDER BY 1
  `) as unknown as { periodo: string; leads: number; ganhos: number }[]
  return rows.map(r => ({ periodo: r.periodo, leads: Number(r.leads) || 0, ganhos: Number(r.ganhos) || 0 }))
}

// Quando o lead chega — dia da semana (0=dom) × hora, em BRT.
export async function entradaPorHorario(grupoId: string, de: string, ate: string) {
  const { ini, fim } = janela(de, ate)
  const rows = await execRows(sql`
    SELECT extract(dow  from l.criado_em AT TIME ZONE 'America/Sao_Paulo')::int as dia,
           extract(hour from l.criado_em AT TIME ZONE 'America/Sao_Paulo')::int as hora,
           count(*)::int as leads
    FROM kommo_leads l
    JOIN kommo_pipeline_grupo pg ON pg.pipeline_id = l.pipeline_id
    WHERE pg.grupo_id = ${grupoId}
      AND l.criado_em >= ${ini} AND l.criado_em <= ${fim}
    GROUP BY 1, 2
  `) as unknown as { dia: number; hora: number; leads: number }[]
  return rows.map(r => ({ dia: Number(r.dia), hora: Number(r.hora), leads: Number(r.leads) || 0 }))
}

// Motivo de perda dos leads que ENTRARAM no período (coorte), não dos fechados
// no período — é o que diz a qualidade do lead que a campanha trouxe.
export async function motivosPerdaCoorte(grupoId: string, de: string, ate: string) {
  const { ini, fim } = janela(de, ate)
  const rows = await execRows(sql`
    SELECT coalesce(r.nome, '(não informado)') as motivo, count(*)::int as qtd
    FROM kommo_leads l
    JOIN kommo_pipeline_grupo pg ON pg.pipeline_id = l.pipeline_id
    LEFT JOIN kommo_loss_reasons r ON r.id = l.loss_reason_id
    WHERE pg.grupo_id = ${grupoId}
      AND l.status_id = ${PERDIDO}
      AND l.criado_em >= ${ini} AND l.criado_em <= ${fim}
    GROUP BY 1 ORDER BY qtd DESC
  `) as unknown as { motivo: string; qtd: number }[]
  const lista = rows.map(r => ({ motivo: r.motivo, qtd: Number(r.qtd) || 0 }))
  return { motivos: lista, total: lista.reduce((a, m) => a + m.qtd, 0) }
}

// Valor de lead ganho acima disto é digitação errada no Kommo, não venda:
// nenhuma moto do grupo custa R$ 200 mil. Um lead com R$ 4.990.000 (visto em
// jul/2026) sozinho multiplica o faturamento do mês por 7 e destrói o ROAS.
export const LIMITE_VALOR_ATIPICO = 200_000

// Não filtra nada do total — só devolve os suspeitos para a página mostrar o
// número cheio E o número sem eles. Decidir por conta própria qual é o certo
// seria esconder um erro de cadastro que alguém precisa corrigir.
export async function valoresAtipicos(grupoId: string, de: string, ate: string) {
  const { ini, fim } = janela(de, ate)
  const rows = await execRows(sql`
    SELECT l.lead_id as lead_id, coalesce(nullif(l.nome, ''), '(sem nome)') as nome, l.price::float8 as valor
    FROM kommo_leads l
    JOIN kommo_pipeline_grupo pg ON pg.pipeline_id = l.pipeline_id
    WHERE pg.grupo_id = ${grupoId}
      AND l.status_id = ${GANHO}
      AND l.criado_em >= ${ini} AND l.criado_em <= ${fim}
      AND l.price > ${LIMITE_VALOR_ATIPICO}
    ORDER BY l.price DESC
    LIMIT 10
  `) as unknown as { lead_id: number; nome: string; valor: number }[]
  const leads = rows.map(r => ({ leadId: Number(r.lead_id), nome: r.nome, valor: Number(r.valor) || 0 }))
  return { leads, total: leads.reduce((a, l) => a + l.valor, 0) }
}

// ─── Telas do Admin ──────────────────────────────────────────────────────────

export type CanalAdmin = {
  sourceId: number
  origem: string | null
  perfil: string | null
  nome: string | null
  rotulo: string
  leads90: number
  funilPrincipal: string | null
}

// Canais para batizar. O funil onde o canal mais aparece é a dica que permite
// reconhecer um número de WhatsApp sem nome ("96% em BH Raja" → é o da BH).
export async function canaisParaAdmin(): Promise<CanalAdmin[]> {
  const rows = await execRows(sql`
    WITH ${FUNIS},
    vol AS (
      SELECT l.source_id, l.pipeline_id, count(*)::int as leads
      FROM kommo_leads l
      WHERE l.source_id IS NOT NULL AND l.criado_em > now() - interval '90 days'
      GROUP BY 1, 2
    ),
    top AS (
      SELECT DISTINCT ON (source_id) source_id, pipeline_id
      FROM vol ORDER BY source_id, leads DESC
    )
    SELECT s.source_id                       as source_id,
           s.origem                          as origem,
           s.perfil                          as perfil,
           s.nome                            as nome,
           coalesce(sum(v.leads), 0)::int    as leads90,
           max(f.pipeline_nome)              as funil_principal
    FROM kommo_sources s
    LEFT JOIN vol v ON v.source_id = s.source_id
    LEFT JOIN top t ON t.source_id = s.source_id
    LEFT JOIN funis f ON f.pipeline_id = t.pipeline_id
    GROUP BY s.source_id, s.origem, s.perfil, s.nome
    ORDER BY leads90 DESC, s.source_id
  `) as unknown as {
    source_id: number; origem: string | null; perfil: string | null
    nome: string | null; leads90: number; funil_principal: string | null
  }[]
  return rows.map(r => ({
    sourceId: Number(r.source_id),
    origem: r.origem,
    perfil: r.perfil,
    nome: r.nome,
    rotulo: rotuloCanal({ sourceId: Number(r.source_id), origem: r.origem, perfil: r.perfil, nome: r.nome }),
    leads90: Number(r.leads90) || 0,
    funilPrincipal: r.funil_principal,
  }))
}

// Todos os funis vistos nos leads, com o grupo atual (null = não classificado).
export async function funisParaAdmin() {
  const rows = await execRows(sql`
    WITH ${FUNIS}
    SELECT l.pipeline_id                                as pipeline_id,
           coalesce(max(f.pipeline_nome), l.pipeline_id) as funil,
           count(*)::int                                 as leads,
           count(*) filter (where l.criado_em > now() - interval '90 days')::int as leads90,
           max(pg.grupo_id::text)                        as grupo_id
    FROM kommo_leads l
    LEFT JOIN funis f ON f.pipeline_id = l.pipeline_id
    LEFT JOIN kommo_pipeline_grupo pg ON pg.pipeline_id = l.pipeline_id
    GROUP BY l.pipeline_id
    ORDER BY leads90 DESC, leads DESC
  `) as unknown as { pipeline_id: string; funil: string; leads: number; leads90: number; grupo_id: string | null }[]
  return rows.map(r => ({
    pipelineId: r.pipeline_id,
    funil: r.funil,
    leads: Number(r.leads) || 0,
    leads90: Number(r.leads90) || 0,
    grupoId: r.grupo_id,
  }))
}

// Funis com lead no período que ninguém classificou em grupo nenhum. Aparecem
// como aviso na página: buraco visível é melhor que lead sumindo em silêncio.
export async function funisNaoClassificados(de: string, ate: string) {
  const { ini, fim } = janela(de, ate)
  const rows = await execRows(sql`
    WITH ${FUNIS}
    SELECT l.pipeline_id                                as pipeline_id,
           coalesce(max(f.pipeline_nome), l.pipeline_id) as funil,
           count(*)::int                                 as leads
    FROM kommo_leads l
    LEFT JOIN kommo_pipeline_grupo pg ON pg.pipeline_id = l.pipeline_id
    LEFT JOIN funis f ON f.pipeline_id = l.pipeline_id
    WHERE (pg.pipeline_id IS NULL OR pg.grupo_id IS NULL)
      AND l.criado_em >= ${ini} AND l.criado_em <= ${fim}
    GROUP BY l.pipeline_id
    ORDER BY leads DESC
  `) as unknown as { pipeline_id: string; funil: string; leads: number }[]
  return rows.map(r => ({ pipelineId: r.pipeline_id, funil: r.funil, leads: Number(r.leads) || 0 }))
}
