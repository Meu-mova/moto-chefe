import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { reservas } from '@/lib/db/schema'
import { lojasDaConta } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

/**
 * Reserva da Conta do usuário, ou null. A Conta entra no where; a regra de loja quem
 * chama confere depois. Reserva de outra Conta volta null, igual a id inexistente: a
 * resposta é "Reserva não encontrada" nos dois casos, e o status só aparece depois da
 * permissão (#404).
 */
export async function reservaDoUsuario(
  usuario: { papel: string; contaId: string | null },
  reservaId: string,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(reservas.lojaId, lojasDaConta(usuario.contaId)) : null
  if (daConta === null) return null
  const [reserva] = await exec
    .select({
      id: reservas.id,
      motoId: reservas.motoId,
      lojaId: reservas.lojaId,
      status: reservas.status,
      clienteNome: reservas.clienteNome,
      valorReserva: reservas.valorReserva,
    })
    .from(reservas)
    .where(and(eq(reservas.id, reservaId), daConta))
    .limit(1)
  return reserva ?? null
}
