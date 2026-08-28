import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { getGrupoAtivo } from '@/lib/grupo'
import { loginFabrica, type FabricaSession } from '@/lib/fabrica-scraper'
import type { getUsuarioLogado } from '@/lib/auth'

// auth.ts não exporta o tipo do usuário — deriva do retorno de getUsuarioLogado.
type UsuarioLogado = Awaited<ReturnType<typeof getUsuarioLogado>>

export type ResultadoLojaFabrica<T> = {
  lojaId: string
  loja: string
  status: 'ok' | 'sem_credencial' | 'erro'
  erro?: string
  dados: T[]
}

/**
 * Roda a mesma leitura no portal da fábrica para cada loja que o usuário enxerga.
 *
 * As telas que falam com a fábrica (retirada de peças, pedidos de compra) repetiam
 * este laço inteiro — escopo de loja, credencial faltando, login, try/catch por loja.
 * O que muda entre elas é só o `ler`.
 *
 * Escopo: admin vê o grupo todo; os demais veem apenas a própria loja (mesma regra
 * das garantias). Sem `lojaId`, um aux_adm não vê loja alguma.
 *
 * Sequencial de propósito: o portal é frágil e paralelizar login na mesma origem
 * arrisca derrubar a sessão de outra loja (mesmo padrão do cron).
 */
export async function paraCadaLojaNaFabrica<T>(
  usuario: UsuarioLogado,
  ler: (session: FabricaSession, loja: { id: string; nome: string }) => Promise<T[]>,
): Promise<ResultadoLojaFabrica<T>[]> {
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const grupo = await getGrupoAtivo(usuario)

  const escopo = isAdmin
    ? and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true))
    : and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true), eq(lojas.id, usuario.lojaId ?? ''))

  const lojasDoGrupo = await db
    .select({ id: lojas.id, nome: lojas.nome, email: lojas.fabricaEmail, senha: lojas.fabricaSenha })
    .from(lojas)
    .where(escopo)
    .orderBy(lojas.nome)

  const resultado: ResultadoLojaFabrica<T>[] = []

  for (const l of lojasDoGrupo) {
    const base = { lojaId: l.id, loja: l.nome }
    const email = l.email?.trim()
    const senha = l.senha?.trim()
    if (!email || !senha) {
      resultado.push({ ...base, status: 'sem_credencial', dados: [] })
      continue
    }

    try {
      const session = await loginFabrica({ email, senha })
      resultado.push({ ...base, status: 'ok', dados: await ler(session, { id: l.id, nome: l.nome }) })
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      // Uma loja com login quebrado não pode zerar a tela das outras.
      console.error(`fábrica: falha ao ler ${l.nome}:`, erro)
      resultado.push({ ...base, status: 'erro', erro, dados: [] })
    }
  }

  return resultado
}
