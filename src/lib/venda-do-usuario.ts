import { and, desc, inArray, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { vendas } from '@/lib/db/schema'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { lojasDaConta } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

/**
 * Venda mais recente que casa com o filtro (por id ou pela moto) e que o usuário pode
 * abrir, ou null. A Conta entra no where, antes do orderBy: venda de outra Conta não
 * conta como "a última da moto" nem responde diferente de venda inexistente (#404).
 * Regra de loja mais estreita (editar, cancelar) quem chama confere depois.
 */
export async function vendaDoUsuario(
  usuario: Parameters<typeof podeAbrirRegistroDaLoja>[0],
  filtro: SQL,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(vendas.lojaId, lojasDaConta(usuario.contaId)) : null
  if (daConta === null) return null
  const [venda] = await exec.select().from(vendas)
    .where(and(filtro, daConta))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)
  if (!venda || !(await podeAbrirRegistroDaLoja(usuario, venda.lojaId, exec))) return null
  return venda
}
