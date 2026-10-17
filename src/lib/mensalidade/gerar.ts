import { and, eq, isNull, sql } from 'drizzle-orm'
import { db, execRows } from '@/lib/db'
import { mensalidades } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { enviarEmail } from '@/lib/email'
import { urlBase } from '@/lib/assinatura/url'
import { criarPreferencia } from '@/lib/mercadopago/cliente'
import { cobrancasDevidas, valorBase } from './regras'
import { emailCobranca } from './mensagens'

type GrupoCobravel = {
  grupo_id: string
  grupo_nome: string
  primeiro_acesso_em: string
  valor_mensal: string
  taxa_implantacao: string | null
  email: string | null
  responsavel: string | null
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
           a.email, a.responsavel
    from grupos g
    left join mensalidade_config c on c.grupo_id = g.id
    left join adesoes_mova a on a.grupo_id = g.id
    where g.ativo
      and g.primeiro_acesso_em is not null
      and coalesce(c.isento, false) = false
      and coalesce(c.valor_mensal, a.valor_mensal) is not null
  `) as Promise<GrupoCobravel[]>
}

/**
 * Cria as cobranças que já deviam existir e o link de cada uma. Seguro para rodar
 * mais de uma vez: a cobrança é única por (grupo, competência), e cobrança aberta
 * sem link (o Mercado Pago falhou antes) ganha o link na próxima rodada.
 */
export async function gerarCobrancas(agora: Date = new Date()): Promise<ResultadoGrupo[]> {
  const hoje = hojeBrt(agora)
  const resultados: ResultadoGrupo[] = []

  for (const g of await gruposCobraveis()) {
    const r: ResultadoGrupo = { grupo: g.grupo_nome, criadas: 0, links: 0 }
    try {
      const mensal = Number(g.valor_mensal)
      const taxa = Number(g.taxa_implantacao ?? 0)
      for (const c of cobrancasDevidas(new Date(g.primeiro_acesso_em), hoje)) {
        const criada = await db.insert(mensalidades).values({
          grupoId: g.grupo_id,
          competencia: c.competencia,
          valor: valorBase(c.n, mensal, taxa).toFixed(2),
          taxaImplantacao: (c.n === 0 ? taxa : 0).toFixed(2),
          vencimento: c.vencimento,
        }).onConflictDoNothing().returning({ id: mensalidades.id })
        r.criadas += criada.length
      }

      const semLink = await db.select().from(mensalidades).where(and(
        eq(mensalidades.grupoId, g.grupo_id), eq(mensalidades.status, 'aberta'), isNull(mensalidades.linkPagamento),
      ))
      for (const m of semLink) {
        const valor = Number(m.valor) + Number(m.acrescimo)
        const pref = await criarPreferencia({
          mensalidadeId: m.id,
          titulo: `Mensalidade MOVA ${m.competencia} — ${g.grupo_nome}`,
          valor,
          emailPagador: g.email,
          urlNotificacao: `${urlBase()}/api/webhooks/mercadopago`,
        })
        await db.update(mensalidades)
          .set({ mpPreferenceId: pref.id, linkPagamento: pref.init_point })
          .where(eq(mensalidades.id, m.id))
        r.links++
        if (g.email) {
          const e = emailCobranca({ responsavel: g.responsavel, grupo: g.grupo_nome, valor, vencimento: m.vencimento, link: pref.init_point })
          await enviarEmail({ para: g.email, assunto: e.assunto, texto: e.texto, html: e.html })
        }
      }
    } catch (e) {
      // Um grupo com problema não para a cobrança dos outros.
      r.erro = e instanceof Error ? e.message : 'erro desconhecido'
    }
    resultados.push(r)
  }
  return resultados
}
