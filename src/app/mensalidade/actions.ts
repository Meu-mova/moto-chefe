'use server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { mensalidades } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { podeUsuarioVerGrupo } from '@/lib/grupo'
import { hojeBrt } from '@/lib/data-venda'
import { urlBase } from '@/lib/assinatura/url'
import { criarPreferencia, expirarPreferencia } from '@/lib/mercadopago/cliente'
import { podePagarMensalidade, valorAtualizado } from '@/lib/mensalidade/regras'
import { abertasCobraveis } from '@/lib/mensalidade/bloqueio'

/**
 * Devolve o link para pagar a mensalidade. Vencida, o valor muda com o atraso: o
 * link é refeito com multa e juros e o antigo é encerrado (contrato 4.4).
 */
export async function linkPagamentoAction(mensalidadeId: string): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const u = await getUsuarioLogado()
  if (!podePagarMensalidade(u.papel)) return { ok: false, erro: 'Só o responsável da empresa paga a mensalidade' }

  const [alvo] = await db.select({ grupoId: mensalidades.grupoId }).from(mensalidades)
    .where(eq(mensalidades.id, mensalidadeId)).limit(1)
  if (!alvo) return { ok: false, erro: 'Mensalidade não encontrada ou já paga' }
  // Só paga a mensalidade de um grupo que enxerga (mesma checagem do seletor de grupo).
  if (!(await podeUsuarioVerGrupo(u, alvo.grupoId))) return { ok: false, erro: 'Mensalidade de outra empresa' }

  const [m] = await abertasCobraveis({ grupoIds: [alvo.grupoId], mensalidadeId })
  if (!m) return { ok: false, erro: 'Mensalidade não encontrada, já paga ou de grupo isento' }

  const { acrescimo, total } = valorAtualizado(Number(m.m.valor), m.m.vencimento, hojeBrt())
  if (m.m.linkPagamento && acrescimo === Number(m.m.acrescimo)) return { ok: true, url: m.m.linkPagamento }

  try {
    const pref = await criarPreferencia({
      mensalidadeId: m.m.id,
      titulo: `Mensalidade MOVA ${m.m.competencia} — ${m.grupoNome}`,
      valor: total,
      emailPagador: u.email,
      urlNotificacao: `${urlBase()}/api/webhooks/mercadopago`,
    })
    const antiga = m.m.mpPreferenceId
    await db.update(mensalidades)
      .set({ acrescimo: acrescimo.toFixed(2), mpPreferenceId: pref.id, linkPagamento: pref.init_point })
      .where(eq(mensalidades.id, m.m.id))
    // Se falhar, o link velho ainda abre, mas o webhook recusa a baixa por valor menor.
    if (antiga && antiga !== pref.id) await expirarPreferencia(antiga).catch(() => {})
    return { ok: true, url: pref.init_point }
  } catch {
    return { ok: false, erro: 'Não deu para gerar o link agora. Tente de novo em alguns minutos.' }
  }
}
