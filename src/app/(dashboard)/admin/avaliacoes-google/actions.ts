'use server'
import { revalidatePath } from 'next/cache'
import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { avaliacoesGoogleLojas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import {
  podeGerirAvaliacoes, salvarChaveGoogle, salvarPlaceIdLoja, sincronizarGrupo,
} from '@/lib/avaliacoes-google/avaliacoes'
import { buscarLugarNoGoogle } from '@/lib/avaliacoes-google/places'

type Resultado = { ok: true; aviso?: string } | { ok: false; erro: string }

const ROTA = '/admin/avaliacoes-google'

// O grupo é sempre o ativo da sessão, nunca um id vindo da tela.
async function contexto() {
  const usuario = await getUsuarioLogado()
  if (!podeGerirAvaliacoes(usuario.papel) || !usuarioPodeAcessar(usuario, ROTA)) return null
  const grupo = await grupoAtivoDaRequisicao(usuario)
  return { usuario, grupoId: grupo.id }
}

const SEM_ACESSO = { ok: false as const, erro: 'Acesso restrito aos sócios' }

export async function salvarChaveGoogleAction(chave: string): Promise<Resultado> {
  const c = await contexto()
  if (!c) return SEM_ACESSO
  const r = await salvarChaveGoogle(c.usuario, { grupoId: c.grupoId, chave })
  if (r.ok) revalidatePath(ROTA)
  return r
}

export async function salvarPlaceIdAction(lojaId: string, placeId: string): Promise<Resultado> {
  const c = await contexto()
  if (!c) return SEM_ACESSO
  const r = await salvarPlaceIdLoja(c.usuario, { grupoId: c.grupoId, lojaId, placeId })
  if (r.ok) revalidatePath(ROTA)
  return r
}

/** Cada leitura no Google é cobrada: o botão não repete antes de 10 minutos. */
export async function atualizarAgoraAction(): Promise<Resultado> {
  const c = await contexto()
  if (!c) return SEM_ACESSO
  const [recente] = await db.select({ lojaId: avaliacoesGoogleLojas.lojaId }).from(avaliacoesGoogleLojas)
    .where(and(
      eq(avaliacoesGoogleLojas.grupoId, c.grupoId),
      gt(avaliacoesGoogleLojas.sincronizadoEm, new Date(Date.now() - 10 * 60_000)),
    )).limit(1)
  if (recente) return { ok: true, aviso: 'Já atualizado nos últimos 10 minutos' }
  const r = await sincronizarGrupo(c.grupoId, { buscarLugar: buscarLugarNoGoogle })
  revalidatePath(ROTA)
  if (r.lojas === 0) return { ok: false, erro: 'Configure a chave do Google e o Place ID de ao menos uma loja' }
  return r.erros ? { ok: true, aviso: `${r.erros} de ${r.lojas} loja(s) com erro; veja o aviso no card` } : { ok: true }
}
