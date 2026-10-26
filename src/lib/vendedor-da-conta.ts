import { and, eq, inArray, or, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, usuarios } from '@/lib/db/schema'
import { contaDaLoja, lojasDaConta } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

/**
 * O vendedor escolhido no payload é da Conta da loja da moto? Vale quem é da Conta
 * (conta_id, como em conferirVinculosDaConta), tem loja nela ou acesso a um grupo dela. Sem isso, um vendedorId forjado
 * ligava a venda a usuário de outra Conta (#404).
 */
export async function vendedorDaConta(vendedorId: string, lojaIdDaMoto: string, exec: Executor = db): Promise<boolean> {
  const contaId = await contaDaLoja(lojaIdDaMoto, exec)
  const gruposDaConta = sql`array(select ${grupos.id} from ${grupos} where ${grupos.contaId} = ${contaId})`
  const [u] = await exec
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(
      eq(usuarios.id, vendedorId),
      or(eq(usuarios.contaId, contaId), inArray(usuarios.lojaId, lojasDaConta(contaId)), sql`${usuarios.gruposAcesso} && ${gruposDaConta}`),
    ))
    .limit(1)
  return !!u
}
