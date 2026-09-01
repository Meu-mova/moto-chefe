import { execRows } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { metricasAtendimento } from './atendimento'
import { descontosPorVendedor } from './descontos'
import { percentualDesconto } from '@/lib/desconto'
import { posicoes, type AtendVendedor } from '@/lib/individual'

// Desempenho individual dos vendedores de um grupo, num mês. Vendas (MOVA) por
// vendedor + atendimento (Kommo, via metricasAtendimento), casados por usuarioId.
// Bordas de mês em UTC, iguais ao fechamento/DRE. Filtra por grupo_id (escalar).

export type Modelo = { nome: string; qtd: number; total: number }
export type VendedorIndividual = {
  usuarioId: string
  nome: string
  loja: string
  grupo: string
  motos: number
  faturamento: number
  faturamentoAnterior: number
  ticket: number
  clientes: number
  posicao: string
  modelos: Modelo[]
  atendimento: AtendVendedor | null
  /** Desconto concedido (medida "preço": quanto cedeu abaixo do piso). */
  desconto: { total: number; qtd: number; pct: number } | null
  /** Tarefas do Kommo em aberto AGORA (snapshot), e quantas estão atrasadas. */
  tarefas: { abertas: number; atrasadas: number } | null
  /** Canais de onde vieram as VENDAS (origem da venda). */
  canaisVendas: Canal[]
  /** Canais de onde vieram os LEADS (source do Kommo). */
  canaisLeads: Canal[]
}
export type Canal = { nome: string; qtd: number }
export type DadosIndividual = {
  ano: number
  mes: number
  vendedores: VendedorIndividual[]
  media: { conversao: number; tempoRespSeg: number; descontoPct: number }
}

const n = (v: unknown) => Number(v ?? 0)
const pad = (m: number) => String(m).padStart(2, '0')

export async function dadosIndividual(opts: {
  grupoId: string
  lojaIds: string[]
  ano: number
  mes: number
}): Promise<DadosIndividual> {
  const { grupoId: g, lojaIds, ano, mes } = opts
  const ini = new Date(Date.UTC(ano, mes - 1, 1)).toISOString()
  const fim = new Date(Date.UTC(ano, mes, 1)).toISOString()
  const jIni = new Date(Date.UTC(ano, mes - 2, 1)).toISOString()      // mês anterior
  const jFim = ini
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate()

  const [vendRows, modRows, atend, descRows, tarRows, canVenRows, canLeadRows] = await Promise.all([
    execRows(sql`
      select v.vendedor_id, u.nome, l.nome as loja, gr.nome as grupo,
        count(*) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim})::int as motos,
        coalesce(sum(v.valor::numeric) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim}),0)::text as fat,
        count(distinct nullif(v.cliente_cpf,'')) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim})::int as clientes,
        coalesce(sum(v.valor::numeric) filter (where v.data_venda >= ${jIni} and v.data_venda < ${jFim}),0)::text as fat_ant
      from vendas v join usuarios u on u.id=v.vendedor_id join lojas l on l.id=v.loja_id join grupos gr on gr.id=l.grupo_id
      where l.grupo_id = ${g} and v.data_venda >= ${jIni} and v.data_venda < ${fim}
      group by v.vendedor_id, u.nome, l.nome, gr.nome
      having count(*) filter (where v.data_venda >= ${ini} and v.data_venda < ${fim}) > 0`),
    execRows(sql`
      select v.vendedor_id, mo.modelo as nome, count(*)::int as qtd, coalesce(sum(v.valor::numeric),0)::text as total
      from vendas v join motos m on m.id=v.moto_id join modelos mo on mo.id=m.modelo_id join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${ini} and v.data_venda < ${fim}
      group by v.vendedor_id, mo.modelo`),
    metricasAtendimento(new Date(ini), new Date(Date.UTC(ano, mes, 1) - 1), `${ano}-${pad(mes)}-01`, `${ano}-${pad(mes)}-${pad(ultimoDia)}`, lojaIds),
    descontosPorVendedor({ dataInicio: `${ano}-${pad(mes)}-01`, dataFim: `${ano}-${pad(mes)}-${pad(ultimoDia)}`, lojaId: lojaIds }),
    // Tarefas do Kommo em aberto AGORA (snapshot), por vendedor — atrasadas = passou do prazo.
    execRows(sql`
      select k.usuario_id as vendedor_id, count(*)::int as abertas,
             count(*) filter (where t.prazo < now())::int as atrasadas
      from kommo_tarefas_abertas t
      left join kommo_leads l on l.lead_id = t.lead_id
      join kommo_user_map k on k.kommo_user_id = coalesce(t.kommo_user_id, l.kommo_user_id)
      join usuarios u on u.id = k.usuario_id
      join lojas lo on lo.id = u.loja_id
      where lo.grupo_id = ${g} and (l.status_id is null or l.status_id not in (142, 143))
      group by k.usuario_id`),
    // Canais das VENDAS (origem da venda) por vendedor
    execRows(sql`
      select v.vendedor_id, coalesce(o.nome,'(sem origem)') as nome, count(*)::int as qtd
      from vendas v left join origens_venda o on o.id=v.origem_id join lojas l on l.id=v.loja_id
      where l.grupo_id = ${g} and v.data_venda >= ${ini} and v.data_venda < ${fim}
      group by v.vendedor_id, o.nome`),
    // Canais dos LEADS (source do Kommo) por vendedor
    execRows(sql`
      select k.usuario_id as vendedor_id, coalesce(s.nome, s.origem, '(sem canal)') as nome, count(*)::int as qtd
      from kommo_leads lead
      join kommo_user_map k on k.kommo_user_id = lead.kommo_user_id
      join usuarios u on u.id = k.usuario_id
      join lojas lo on lo.id = u.loja_id
      left join kommo_sources s on s.source_id = lead.source_id
      where lo.grupo_id = ${g} and lead.criado_em >= ${ini} and lead.criado_em < ${fim}
      group by k.usuario_id, coalesce(s.nome, s.origem, '(sem canal)')`),
  ])

  // Merge vendas por vendedor (Pablo aparece em 2 lojas — soma e pega a loja principal)
  type Acc = { usuarioId: string; nome: string; grupo: string; motos: number; fat: number; fatAnt: number; clientes: number; lojas: Map<string, number> }
  const porVend = new Map<string, Acc>()
  for (const r of vendRows as any[]) {
    const id = r.vendedor_id
    const a = porVend.get(id) ?? { usuarioId: id, nome: r.nome, grupo: r.grupo, motos: 0, fat: 0, fatAnt: 0, clientes: 0, lojas: new Map() }
    a.motos += n(r.motos); a.fat += n(r.fat); a.fatAnt += n(r.fat_ant); a.clientes += n(r.clientes)
    a.lojas.set(r.loja, (a.lojas.get(r.loja) ?? 0) + n(r.motos))
    porVend.set(id, a)
  }

  const modByVend = new Map<string, Modelo[]>()
  for (const r of modRows as any[]) {
    const arr = modByVend.get(r.vendedor_id) ?? []
    arr.push({ nome: r.nome, qtd: n(r.qtd), total: n(r.total) })
    modByVend.set(r.vendedor_id, arr)
  }

  const atendByUser = new Map(atend.filter(a => a.usuarioId).map(a => [a.usuarioId as string, a]))
  const descByVend = new Map((descRows as any[]).map(d => [d.vendedorId as string, d]))
  const tarByVend = new Map((tarRows as any[]).map(r => [r.vendedor_id as string, r]))
  const agruparCanal = (rows: any[]) => {
    const m = new Map<string, Canal[]>()
    for (const r of rows) { const arr = m.get(r.vendedor_id) ?? []; arr.push({ nome: r.nome, qtd: n(r.qtd) }); m.set(r.vendedor_id, arr) }
    for (const arr of m.values()) arr.sort((x, y) => y.qtd - x.qtd)
    return m
  }
  const canVenByVend = agruparCanal(canVenRows as any[])
  const canLeadByVend = agruparCanal(canLeadRows as any[])

  const lista = [...porVend.values()]
    .map(a => {
      const lojaPrincipal = [...a.lojas.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? '—'
      const at = atendByUser.get(a.usuarioId)
      const atendimento: AtendVendedor | null = at ? {
        leads: n(at.volume), comIncoming: n(at.comIncoming), semResposta: n(at.semResposta),
        tempoRespSeg: at.tempoRespSeg, mensagens: n(at.mensagens), tarefas: n(at.tarefas),
        ganhos: n(at.ganhos), perdidos: n(at.perdidos), conversao: n(at.conversao) * 100,
      } : null
      const desc = descByVend.get(a.usuarioId)
      const tar = tarByVend.get(a.usuarioId)
      return {
        usuarioId: a.usuarioId, nome: a.nome, loja: lojaPrincipal, grupo: a.grupo,
        motos: a.motos, faturamento: a.fat, faturamentoAnterior: a.fatAnt,
        ticket: a.motos ? a.fat / a.motos : 0, clientes: a.clientes,
        modelos: (modByVend.get(a.usuarioId) ?? []).sort((x, y) => y.total - x.total),
        atendimento,
        desconto: desc ? { total: n(desc.preco), qtd: n(desc.qtd), pct: percentualDesconto(n(desc.preco), a.fat) } : null,
        tarefas: tar ? { abertas: n(tar.abertas), atrasadas: n(tar.atrasadas) } : null,
        canaisVendas: canVenByVend.get(a.usuarioId) ?? [],
        canaisLeads: canLeadByVend.get(a.usuarioId) ?? [],
        posicao: '',
      }
    })
    .sort((x, y) => y.motos - x.motos)

  const rotulos = posicoes(lista.map(v => v.motos))
  lista.forEach((v, i) => { v.posicao = rotulos[i] })

  const comAtend = lista.filter(v => v.atendimento) as (VendedorIndividual & { atendimento: AtendVendedor })[]
  const totDesconto = (descRows as any[]).reduce((s, d) => s + n(d.preco), 0)
  const totFaturamento = lista.reduce((s, v) => s + v.faturamento, 0)
  const media = {
    conversao: comAtend.length ? comAtend.reduce((s, v) => s + v.atendimento.conversao, 0) / comAtend.length : 0,
    tempoRespSeg: (() => {
      const t = comAtend.map(v => v.atendimento.tempoRespSeg).filter((x): x is number => x != null)
      return t.length ? t.reduce((s, x) => s + x, 0) / t.length : 0
    })(),
    descontoPct: percentualDesconto(totDesconto, totFaturamento),
  }

  return { ano, mes, vendedores: lista, media }
}
