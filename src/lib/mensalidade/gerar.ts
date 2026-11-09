import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
import { mensalidades } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { enviarEmail } from '@/lib/email'
import { adesaoACobrar, basePrimeiraMensalidade, cobrancasDevidas, ehRegimeNovo, taxaDaPrimeiraMensalidade, valorBase } from './regras'
import { versaoAssinadaDaAdesao } from './regime'
import { emailVencimento } from './mensagens'
import { enviarCobranca, gerarLink } from './link'
import { recuperarAdesoes } from './adesao'

type GrupoCobravel = {
  grupo_id: string
  grupo_nome: string
  primeiro_acesso_em: string
  valor_mensal: string
  taxa_implantacao: string | null
  email: string | null
  responsavel: string | null
  versao_assinada: number | null
  adesao_status: 'aberta' | 'paga' | 'cancelada' | null
  adesao_paga_em: string | null
  taxa_ficha: string | null
}

export type ResultadoGrupo = { grupo: string; criadas: number; links: number; erro?: string }

/**
 * Grupos que pagam: já tiveram o 1º acesso, não são isentos e têm valor (da
 * configuração ou, sem ela, da adesão ligada ao grupo). Grupo sem linha em
 * mensalidade_config não é isento: só os do Cesar foram marcados (0128).
 */
async function gruposCobraveis(): Promise<GrupoCobravel[]> {
  return execRows(sql`
    select g.id as grupo_id, g.nome as grupo_nome, g.primeiro_acesso_em::text,
           coalesce(c.valor_mensal, a.valor_mensal)::text as valor_mensal,
           coalesce(c.taxa_implantacao, a.taxa_implantacao)::text as taxa_implantacao,
           a.email, a.responsavel, ${versaoAssinadaDaAdesao} as versao_assinada,
           ad.status as adesao_status, ad.pago_em::text as adesao_paga_em, a.taxa_implantacao::text as taxa_ficha
    from grupos g
    left join mensalidade_config c on c.grupo_id = g.id
    left join adesoes_mova a on a.grupo_id = g.id
    left join mensalidades ad on ad.grupo_id = g.id and ad.tipo = 'adesao'
    where g.ativo
      and g.primeiro_acesso_em is not null
      and coalesce(c.isento, false) = false
      and coalesce(c.valor_mensal, a.valor_mensal) is not null
  `) as Promise<GrupoCobravel[]>
}

/**
 * Cria as cobranças que já deviam existir e o link de cada uma; no fim, recupera a adesão
 * (`recuperarAdesoes`, #804). Seguro para rodar
 * mais de uma vez: a cobrança é única por (grupo, competência), e cobrança aberta
 * sem link (o Mercado Pago falhou antes) ganha o link na próxima rodada.
 */
export async function gerarCobrancas(agora: Date = new Date()): Promise<ResultadoGrupo[]> {
  const hoje = hojeBrt(agora)
  const resultados: ResultadoGrupo[] = []

  for (const g of await gruposCobraveis()) {
    const r: ResultadoGrupo = { grupo: g.grupo_nome, criadas: 0, links: 0 }
    const falhasEmail: string[] = []
    try {
      const mensal = Number(g.valor_mensal)
      const regimeNovo = ehRegimeNovo(g.versao_assinada)
      const taxa = taxaDaPrimeiraMensalidade(regimeNovo, Number(g.taxa_implantacao ?? 0))
      // Isento não chega aqui: a mesma regra que decide se o 1º acesso cria a adesão.
      const cobraAdesao = adesaoACobrar({ versaoAssinada: g.versao_assinada, taxaFicha: g.taxa_ficha, isento: false }) !== null
      const base = basePrimeiraMensalidade({
        regimeNovo, cobraAdesao,
        primeiroAcesso: new Date(g.primeiro_acesso_em),
        adesao: g.adesao_status ? { status: g.adesao_status, pagoEm: g.adesao_paga_em ? new Date(g.adesao_paga_em) : null } : null,
      })
      // Só por SQL manual: sem a data, não há de onde contar a 1ª mensalidade.
      if (g.adesao_status === 'paga' && !g.adesao_paga_em) falhasEmail.push('adesão paga sem data do pagamento')
      const devidas = base ? cobrancasDevidas(base, hoje) : []
      for (const c of devidas) {
        const criada = await db.insert(mensalidades).values({
          grupoId: g.grupo_id,
          competencia: c.competencia,
          valor: valorBase(c.n, mensal, taxa).toFixed(2),
          taxaImplantacao: (c.n === 0 ? taxa : 0).toFixed(2),
          vencimento: c.vencimento,
        }).onConflictDoNothing().returning({ id: mensalidades.id })
        r.criadas += criada.length
      }

      // A adesão sai pelo recuperarAdesoes, o mesmo caminho do 1º acesso.
      const semLink = await db.select().from(mensalidades).where(and(
        eq(mensalidades.grupoId, g.grupo_id), eq(mensalidades.tipo, 'mensalidade'), eq(mensalidades.status, 'aberta'), isNull(mensalidades.linkPagamento),
      ))
      for (const m of semLink) {
        // Cobrança que já nasce vencida (cron parado, 1ª rodada com atrasadas) leva
        // multa e juros no link; senão o webhook aceitaria o valor base como pago.
        const link = await gerarLink(m, g.grupo_nome, g.email, hoje)
        // Outro caminho ("Pagar") gravou o link primeiro.
        if (!link.gravou) continue
        r.links++
        // O link já foi gravado e a próxima rodada não reenvia: a falha precisa aparecer.
        const falha = await enviarCobranca(m, { grupo: g.grupo_nome, email: g.email, responsavel: g.responsavel }, link)
        if (falha) falhasEmail.push(`${m.competencia}: ${falha}`)
      }
      if (falhasEmail.length) r.erro = falhasEmail.join('; ')
    } catch (e) {
      // Um grupo com problema não para a cobrança dos outros.
      r.erro = e instanceof Error ? e.message : 'erro desconhecido'
    }
    resultados.push(r)
  }
  return [...resultados, ...await recuperarAdesoes(agora)]
}

/**
 * E-mail no dia do vencimento para cada mensalidade ainda aberta. Marca o envio
 * antes de mandar: se o cron rodar de novo no mesmo dia, ninguém recebe dois.
 */
export type ResultadoAvisos = { enviados: number; falhas: string[] }

export async function avisarVencimentos(agora: Date = new Date()): Promise<ResultadoAvisos> {
  const hoje = hojeBrt(agora)
  const marcadas = await execRows(sql`
    update mensalidades m set aviso_vencimento_em = now()
    from grupos g
    left join adesoes_mova a on a.grupo_id = g.id
    left join mensalidade_config c on c.grupo_id = g.id
    where g.id = m.grupo_id and m.tipo = 'mensalidade' and m.status = 'aberta' and m.vencimento = ${hoje}
      and m.aviso_vencimento_em is null and not coalesce(c.isento, false)
    returning m.valor::text as valor, m.acrescimo::text as acrescimo, m.vencimento::text as vencimento,
              m.competencia, m.link_pagamento, g.nome as grupo, a.email, a.responsavel
  `) as { valor: string; acrescimo: string; vencimento: string; competencia: string; link_pagamento: string | null; grupo: string; email: string | null; responsavel: string | null }[]
  // Já marcada, a próxima rodada não reenvia: a falha precisa aparecer na resposta do cron.
  const r: ResultadoAvisos = { enviados: 0, falhas: [] }
  for (const m of marcadas) {
    if (!m.email) {
      r.falhas.push(`${m.grupo} ${m.competencia}: adesão sem e-mail`)
      continue
    }
    const e = emailVencimento({ responsavel: m.responsavel, grupo: m.grupo, valor: Number(m.valor) + Number(m.acrescimo), vencimento: m.vencimento, link: m.link_pagamento })
    const envio = await enviarEmail({ para: m.email, assunto: e.assunto, texto: e.texto, html: e.html })
    if (envio.status === 'enviado') r.enviados++
    else r.falhas.push(`${m.grupo} ${m.competencia}: e-mail ${envio.status}`)
  }
  return r
}
