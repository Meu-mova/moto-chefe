'use server'
import { cookies, headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, podeUsuarioVerGrupo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { origemDaRequisicao, registrarSemFalhar } from '@/lib/log-acoes'

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

export async function trocarGrupoAtivoAction(grupoId: string) {
  const usuario = await getUsuarioLogado()
  if (!ADMIN_PAPEIS.includes(usuario.papel)) throw new Error('Sem permissão')

  if (typeof grupoId !== 'string' || !grupoId) throw new Error('Grupo inválido')

  // Porta principal do seletor de empresa: valida posse ANTES de gravar o
  // cookie. Sem isto, qualquer admin_socio trocava para o CNPJ de outro
  // lojista só chamando esta action com outro id — era a causa raiz do
  // vazamento entre tenants. Grupo sem posse: não grava, devolve erro.
  const podeVer = await podeUsuarioVerGrupo(usuario, grupoId)
  if (!podeVer) throw new Error('Você não tem acesso a este grupo')

  // Sem cookie ainda, o grupo ativo é o padrão (o da loja); é ele que a pessoa estava usando.
  const anterior = (await getGrupoAtivo(usuario).catch(() => null))?.id ?? null
  const cookieStore = await cookies()
  cookieStore.set('grupoAtivo', grupoId, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365,
    path: '/',
  })

  if (anterior !== grupoId) {
    // A Conta é a do grupo de destino: admin_geral entrando em outra Conta aparece para o admin dela.
    const [destino] = await db.select({ contaId: grupos.contaId }).from(grupos).where(eq(grupos.id, grupoId)).limit(1).catch(() => [])
    await registrarSemFalhar({
      tipo: 'troca_grupo', usuarioId: usuario.id, contaId: destino?.contaId ?? null, grupoId,
      detalhe: { de: anterior }, ...origemDaRequisicao(await headers()),
    })
  }

  revalidatePath('/', 'layout')
}
