/**
 * Cliente lido pela OS (#450): liberado pelo módulo OS, não pelo de clientes, porque quem
 * tem clientes bloqueado ainda abre OS. Só da Conta; outra Conta e id inexistente dão null.
 */
import { and, eq } from 'drizzle-orm'
import type { db } from '@/lib/db'
import { clientes } from '@/lib/db/schema'
import { acessaModulo, type UsuarioNav } from '@/lib/navegacao'

type Executor = Pick<typeof db, 'select'>

export async function clienteDaOs(exec: Executor, usuario: UsuarioNav & { contaId: string }, id: string) {
  if (!acessaModulo(usuario, 'ordens-servico')) return null
  const [cliente] = await exec
    .select({ id: clientes.id, nome: clientes.nome, cpfCnpj: clientes.cpfCnpj, celular: clientes.celular, email: clientes.email })
    .from(clientes)
    .where(and(eq(clientes.id, id), eq(clientes.contaId, usuario.contaId)))
    .limit(1)
  return cliente ?? null
}
