'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { ehUuid } from '@/lib/uuid'
import { hojeBrt } from '@/lib/data-venda'
import { LINK_INDISPONIVEL, MENSALIDADE_NAO_ENCONTRADA, podePagarMensalidade, valorAtualizado } from '@/lib/mensalidade/regras'
import { abertasCobraveis } from '@/lib/mensalidade/bloqueio'
import { gruposDaMensalidade } from '@/lib/mensalidade/grupos'
import { cobrarAdesao, gerarLink } from '@/lib/mensalidade/link'

/**
 * Devolve o link para pagar a mensalidade ou a adesão; sem link (o Mercado Pago falhou antes), é o
 * "Tentar de novo". Vencida, o valor muda com o atraso: o link é refeito com multa e juros e o
 * antigo é encerrado (contrato 4.4).
 */
export async function linkPagamentoAction(mensalidadeId: string): Promise<{ ok: true; url: string } | { ok: false; erro: string }> {
  const u = await getUsuarioLogado()
  if (!podePagarMensalidade(u.papel)) return { ok: false, erro: 'Só o responsável da empresa paga a mensalidade' }

  if (!ehUuid(mensalidadeId)) return { ok: false, erro: MENSALIDADE_NAO_ENCONTRADA }

  // Os mesmos grupos da lista da tela, dentro da consulta: mensalidade de outra Conta e id
  // inexistente recebem a mesma frase (#773). Erro do banco não vira "não encontrada" (#578).
  const lida = await gruposDaMensalidade(u, () => grupoAtivoDaRequisicao(u))
    .then(grupos => abertasCobraveis({ grupoIds: grupos.map(g => g.id), mensalidadeId }))
    .then(([m]) => ({ m }), (e: unknown) => {
      console.error('[mensalidade] leitura para o link:', e instanceof Error ? e.message : e)
      return null
    })
  if (!lida) return { ok: false, erro: LINK_INDISPONIVEL }
  const { m } = lida
  if (!m) return { ok: false, erro: MENSALIDADE_NAO_ENCONTRADA }

  const hoje = hojeBrt()
  const { acrescimo } = valorAtualizado(m.m, hoje)
  if (m.m.linkPagamento && acrescimo === Number(m.m.acrescimo)) return { ok: true, url: m.m.linkPagamento }

  // Adesão que ficou sem link no 1º acesso: o link sai com o e-mail de adesão, como lá.
  if (m.m.tipo === 'adesao' && !m.m.linkPagamento) {
    const r = await cobrarAdesao(m.m.id).catch(() => ({ url: null, falha: 'leitura da adesão' }))
    if (r.falha) console.error('[adesao] link ou e-mail pelo Pagar:', r.falha)
    return r.url ? { ok: true, url: r.url } : { ok: false, erro: LINK_INDISPONIVEL }
  }
  try {
    return { ok: true, url: (await gerarLink(m.m, m.grupoNome, u.email, hoje)).url }
  } catch {
    return { ok: false, erro: LINK_INDISPONIVEL }
  }
}
