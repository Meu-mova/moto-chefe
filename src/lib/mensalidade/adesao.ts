import { sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
import { mensalidades } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { adesaoACobrar, VERSAO_COBRANCA_ADESAO_NO_ACESSO } from './regras'
import { versaoAssinadaDaAdesao } from './regime'
import { cobrarAdesao } from './link'
import type { ResultadoGrupo } from './gerar'

type Executor = Pick<typeof db, 'execute' | 'insert'>
type DadosDaAdesao = { versao_assinada: number | null; taxa_ficha: string | null; isento: boolean }

/**
 * Cria a cobrança da adesão do grupo, se ele está no regime novo (contrato assinado na versão 2,
 * taxa da ficha > 0, não isento). Idempotente pelo índice de uma adesão por grupo. Vence no dia
 * (Brasília) do 1º acesso. Usada pelo 1º acesso, dentro da transação dele, e pelo cron (#804).
 * Devolve o id da adesão criada, ou null se não criou.
 */
export async function criarAdesaoDoGrupo(exec: Executor, grupoId: string, primeiroAcesso: Date): Promise<string | null> {
  const [d] = (await exec.execute(sql`
    select ${versaoAssinadaDaAdesao} as versao_assinada,
           a.taxa_implantacao::text as taxa_ficha,
           coalesce(cfg.isento, false) as isento
    from adesoes_mova a
    left join mensalidade_config cfg on cfg.grupo_id = a.grupo_id
    where a.grupo_id = ${grupoId}
  `) as unknown as { rows: DadosDaAdesao[] }).rows
  const valor = d ? adesaoACobrar({ versaoAssinada: d.versao_assinada, taxaFicha: d.taxa_ficha, isento: d.isento }) : null
  if (valor === null) return null

  const [criada] = await exec.insert(mensalidades).values({
    grupoId, tipo: 'adesao', competencia: null,
    valor: valor.toFixed(2), taxaImplantacao: valor.toFixed(2), vencimento: hojeBrt(primeiroAcesso),
  }).onConflictDoNothing().returning({ id: mensalidades.id })
  return criada?.id ?? null
}

type Pendente = { grupo_id: string; grupo_nome: string; primeiro_acesso_em: string; adesao_id: string | null }

/**
 * Grupos ativos e não isentos, com 1º acesso, cuja adesão falta (contrato assinado na versão 2) ou
 * está aberta sem link. Sem filtro de valor mensal: a adesão não depende dele.
 */
function adesoesPendentes(): Promise<Pendente[]> {
  return execRows(sql`
    select g.id as grupo_id, g.nome as grupo_nome, g.primeiro_acesso_em::text, m.id as adesao_id
    from grupos g
    join adesoes_mova a on a.grupo_id = g.id
    left join mensalidades m on m.grupo_id = g.id and m.tipo = 'adesao'
    left join mensalidade_config c on c.grupo_id = g.id
    where g.ativo and g.primeiro_acesso_em is not null and not coalesce(c.isento, false)
      and ((m.id is null and ${versaoAssinadaDaAdesao} = ${VERSAO_COBRANCA_ADESAO_NO_ACESSO})
        or (m.status = 'aberta' and m.link_pagamento is null))
  `) as Promise<Pendente[]>
}

async function recuperarUma(p: Pendente, agora: Date): Promise<ResultadoGrupo | null> {
  try {
    const criada = p.adesao_id ? null : await criarAdesaoDoGrupo(db, p.grupo_id, new Date(p.primeiro_acesso_em))
    const id = p.adesao_id ?? criada
    // Taxa zero ou vazia, ou grupo isento: não há o que cobrar nem o que mostrar no resultado.
    if (!id) return null
    const { url, falha } = await cobrarAdesao(id, agora)
    return { grupo: p.grupo_nome, criadas: criada ? 1 : 0, links: url ? 1 : 0, ...(falha ? { erro: `adesão: ${falha}` } : {}) }
  } catch (e) {
    // Um grupo com problema não para a recuperação dos outros.
    return { grupo: p.grupo_nome, criadas: 0, links: 0, erro: `adesão: ${e instanceof Error ? e.message : 'erro desconhecido'}` }
  }
}

/**
 * Rede do cron para a adesão (#804): cria a que faltou depois do 1º acesso e gera o link (e o e-mail,
 * uma vez) da que ficou sem, pelo mesmo `cobrarAdesao` do 1º acesso e do "Pagar".
 */
export async function recuperarAdesoes(agora: Date = new Date()): Promise<ResultadoGrupo[]> {
  const resultados: (ResultadoGrupo | null)[] = []
  for (const p of await adesoesPendentes()) resultados.push(await recuperarUma(p, agora))
  return resultados.filter(r => r !== null)
}
