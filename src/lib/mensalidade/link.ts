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
 */
export async function gerarLink(m: Mensalidade, grupo: string, emailPagador: string | null, hoje: string): Promise<{ url: string; total: number }> {
  const { acrescimo, total } = valorAtualizado(m, hoje)
  const pref = await criarPreferencia({
    mensalidadeId: m.id, tipo: m.tipo, titulo: titulo(m, grupo), valor: total, emailPagador,
    urlNotificacao: `${urlBase()}/api/webhooks/mercadopago`,
  })
  await db.update(mensalidades)
    .set({ acrescimo: acrescimo.toFixed(2), mpPreferenceId: pref.id, linkPagamento: pref.init_point })
    .where(eq(mensalidades.id, m.id))
  // Se falhar, o link velho ainda abre, mas o webhook recusa a baixa por valor menor.
  if (m.mpPreferenceId && m.mpPreferenceId !== pref.id) await expirarPreferencia(m.mpPreferenceId).catch(() => {})
  return { url: pref.init_point, total }
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
 * Link e e-mail da adesão recém-criada no 1º acesso (#803). Roda depois da resposta: o Mercado
 * Pago pode levar até 15 s e não pode segurar nem desfazer a gravação da cobrança. Adesão que já
 * tem link (ou já foi paga) fica como está.
 */
export async function cobrarAdesao(adesaoId: string, agora: Date = new Date()): Promise<{ ok: true } | { ok: false; erro: string }> {
  const [l] = await db.select({ m: mensalidades, grupo: grupos.nome, email: adesoesMova.email, responsavel: adesoesMova.responsavel })
    .from(mensalidades)
    .innerJoin(grupos, eq(grupos.id, mensalidades.grupoId))
    .leftJoin(adesoesMova, eq(adesoesMova.grupoId, mensalidades.grupoId))
    .where(and(eq(mensalidades.id, adesaoId), eq(mensalidades.tipo, 'adesao'), eq(mensalidades.status, 'aberta'), isNull(mensalidades.linkPagamento)))
  if (!l) return { ok: true }
  try {
    const link = await gerarLink(l.m, l.grupo, l.email, hojeBrt(agora))
    const falha = await enviarCobranca(l.m, l, link)
    return falha ? { ok: false, erro: falha } : { ok: true }
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : 'erro desconhecido' }
  }
}
