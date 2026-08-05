import { createClient } from '@/lib/supabase/server'
import { db } from '@/lib/db'
import { usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { redirect } from 'next/navigation'
import { cache } from 'react'

// getUsuarioLogado roda PRIMEIRO em toda página (layout e página). Se a query de
// usuário fica esperando uma conexão do pool (instância do Fluid com conexões
// presas), sem timeout ela pendura a requisição inteira até os 300s da Vercel —
// era a peça do caminho crítico que faltava blindar. Timeout curto que ESTOURA
// (não desloga): cai no error boundary com "Tentar novamente", em vez de travar.
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) => setTimeout(() => rej(new Error(`Timeout ${ms}ms na autenticação`)), ms)),
  ])
}

export const getUsuarioLogado = cache(async () => {
  const supabase = await createClient()
  // getUser() é uma chamada HTTP ao auth do Supabase; sem timeout, um soluço dela
  // pendura a página até os 300s. Estoura rápido → error boundary "Tentar de novo".
  const { data: { user } } = await withTimeout(supabase.auth.getUser(), 8000)

  if (!user) redirect('/login')

  const [usuario] = await withTimeout(
    db.select().from(usuarios).where(eq(usuarios.id, user.id)).limit(1),
    8000,
  )

  if (!usuario) redirect('/login')

  return usuario
})

export function isAdmin(papel: string) {
  return papel === 'admin_geral'
}

// ─── Papéis acumulados ────────────────────────────────────────────────────────
// Uma pessoa pode exercer mais de uma função (ex.: Tiago é aux_adm em Lavras e
// também vende). `papel` continua sendo o papel principal e governa todo o
// sistema; `papeisExtras` só acrescenta.
//
// A migração dos gates de `papel === 'x'` para cá é incremental e proposital:
// existem centenas de leituras de `.papel`, quase todas gate de admin, que não
// têm nada a ver com papel duplo. Um gate ainda não migrado faz a pessoa deixar
// de ver algo que poderia ver — nunca o contrário.
export function temPapel(
  usuario: { papel: string; papeisExtras?: string[] | null },
  papel: string,
) {
  return usuario.papel === papel || (usuario.papeisExtras ?? []).includes(papel)
}

// ─── Exceção pontual: entrada/importação de motos ─────────────────────────────
// Liberado nominalmente para o adm da loja de Pouso Alegre, por decisão
// explícita — NÃO é uma permissão do papel aux_adm, os demais aux_adm continuam
// de fora. Mesmo padrão de podeTransferirEntreGrupos em @/lib/grupo.
const EMAIL_ENTRADA_MOTOS = 'pedro.henrique@motochefesuldeminas.com.br'

export function podeRegistrarEntradaMotos(usuario: { papel: string; email: string }) {
  if (['admin_geral', 'admin_socio'].includes(usuario.papel)) return true
  return usuario.email === EMAIL_ENTRADA_MOTOS
}

export function canEditLoja(usuarioLojaId: string | null, targetLojaId: string, papel: string) {
  if (papel === 'admin_geral') return true
  return usuarioLojaId === targetLojaId
}
