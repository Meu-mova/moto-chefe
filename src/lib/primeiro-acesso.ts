import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'

// Marca o 1º acesso do grupo da loja do usuário (#207). Roda em toda página, por
// isso é um único UPDATE que não casa nada depois da primeira vez.

export function contaComoPrimeiroAcesso(usuario: { papel: string; lojaId: string | null }): boolean {
  return usuario.papel !== 'admin_geral' && usuario.lojaId !== null
}

export async function registrarPrimeiroAcesso(usuario: { papel: string; lojaId: string | null }): Promise<void> {
  if (!contaComoPrimeiroAcesso(usuario)) return
  await db.execute(sql`
    update grupos set primeiro_acesso_em = now()
    where primeiro_acesso_em is null
      and id = (select grupo_id from lojas where id = ${usuario.lojaId})
  `)
}
