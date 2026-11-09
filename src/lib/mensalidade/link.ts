import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { adesoesMova, grupos, mensalidades } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { enviarEmail } from '@/lib/email'
import { urlBase } from '@/lib/assinatura/url'
import { criarPreferencia, expirarPreferencia } from '@/lib/mercadopago/cliente'
import { valorAtualizado } from './regras'
import { emailCobranca } from './mensagens'

type Mensalidade = typeof mensalidades.$inferSelect

// Título que o pagador vê no Mercado Pago.
const titulo = (m: Mensalidade, grupo: string) =>
  m.tipo === 'adesao' ? `Adesão ao MOVA de ${grupo}` : `Mensalidade MOVA ${m.competencia} — ${grupo}`

/**
 * Pede o link do Mercado Pago no valor do dia (vencida, com multa e juros; adesão, sem) e grava
 * na cobrança. Link anterior com outro valor é encerrado. Única regra para o "Pagar", o cron e o
 * 1º acesso. Falha do Mercado Pago sobe: quem chama decide o que mostrar.
 * Só grava se o link ainda é o que foi lido: dois pedidos ao mesmo tempo (1º acesso e "Pagar")
 * não se sobrescrevem; quem chegou depois recebe o link gravado e `gravou: false`.
 */
export async function gerarLink(
  m: Mensalidade, grupo: string, emailPagador: string | null, hoje: string,
): Promise<{ url: string; total: number; gravou: boolean }> {
  const { acrescimo, total } = valorAtualizado(m, hoje)
  const pref = await criarPreferencia({
    mensalidadeId: m.id, tipo: m.tipo, titulo: titulo(m, grupo), valor: total, emailPagador,
    urlNotificacao: `${urlBase()}/api/webhooks/mercadopago`,
  })
  const linkLido = m.linkPagamento === null ? isNull(mensalidades.linkPagamento) : eq(mensalidades.linkPagamento, m.linkPagamento)
  const gravada = await db.update(mensalidades)
    .set({ acrescimo: acrescimo.toFixed(2), mpPreferenceId: pref.id, linkPagamento: pref.init_point })
    .where(and(eq(mensalidades.id, m.id), linkLido))
    .returning({ id: mensalidades.id })
  if (gravada.length === 0) {
    const [atual] = await db.select({ link: mensalidades.linkPagamento }).from(mensalidades).where(eq(mensalidades.id, m.id))
    return { url: atual?.link ?? pref.init_point, total, gravou: false }
  }
  // Se falhar, o link velho ainda abre, mas o webhook recusa a baixa por valor menor.
  if (m.mpPreferenceId && m.mpPreferenceId !== pref.id) await expirarPreferencia(m.mpPreferenceId).catch(() => {})
  return { url: pref.init_point, total, gravou: true }
}

/** Manda o e-mail da cobrança com o link. Devolve o motivo da falha, ou null se saiu. */
export async function enviarCobranca(
  m: Mensalidade, dest: { grupo: string; email: string | null; responsavel: string | null }, link: { url: string; total: number },
): Promise<string | null> {
  if (!dest.email) return 'adesão sem e-mail'
  const e = emailCobranca({ tipo: m.tipo, responsavel: dest.responsavel, grupo: dest.grupo, valor: link.total, vencimento: m.vencimento, link: link.url })
  const envio = await enviarEmail({ para: dest.email, assunto: e.assunto, texto: e.texto, html: e.html })
  return envio.status === 'enviado' ? null : `e-mail ${envio.status}`
}

/**
 * Link e e-mail da adesão (#803): depois da resposta do 1º acesso (o Mercado Pago pode levar até
 * 15 s e não pode segurar nem desfazer a gravação da cobrança) e no "Pagar" depois de uma falha.
 * O e-mail sai uma vez, de quem gravou o 1º link; adesão que já tem link devolve esse link.
 * Adesão paga ou inexistente: `url` nulo. `falha` diz por que o link ou o e-mail não saiu.
 */
export async function cobrarAdesao(adesaoId: string, agora: Date = new Date()): Promise<{ url: string | null; falha: string | null }> {
  const [l] = await db.select({ m: mensalidades, grupo: grupos.nome, email: adesoesMova.email, responsavel: adesoesMova.responsavel })
    .from(mensalidades)
    .innerJoin(grupos, eq(grupos.id, mensalidades.grupoId))
    .leftJoin(adesoesMova, eq(adesoesMova.grupoId, mensalidades.grupoId))
    .where(and(eq(mensalidades.id, adesaoId), eq(mensalidades.tipo, 'adesao'), eq(mensalidades.status, 'aberta')))
  if (!l) return { url: null, falha: null }
  if (l.m.linkPagamento) return { url: l.m.linkPagamento, falha: null }
  const motivo = (e: unknown) => e instanceof Error ? e.message : 'erro desconhecido'
  const link = await gerarLink(l.m, l.grupo, l.email, hojeBrt(agora)).catch((e: unknown) => motivo(e))
  if (typeof link === 'string') return { url: null, falha: link }
  if (!link.gravou) return { url: link.url, falha: null }
  // O link já está gravado: falha do e-mail não pode escondê-lo de quem pediu.
  return { url: link.url, falha: await enviarCobranca(l.m, l, link).catch(motivo) }
}
