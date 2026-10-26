import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { agendamentos } from '@/lib/db/schema'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { lojasDaConta } from '@/lib/conta'

type Executor = Pick<typeof db, 'select'>

/**
 * Agendamento em que o usuário pode agir, ou null. A Conta entra no where; a regra de loja
 * vem depois, no podeAgirNaLoja. Agendamento de outra Conta volta null, igual a inexistente:
 * quem chama responde "Agendamento não encontrado" nos dois casos (#404).
 */
export async function agendamentoDoUsuario(
  usuario: Parameters<typeof podeAgirNaLoja>[0],
  agendamentoId: string,
  exec: Executor = db,
) {
  const daConta = usuario.papel === 'admin_geral' ? undefined
    : usuario.contaId ? inArray(agendamentos.lojaId, lojasDaConta(usuario.contaId)) : null
  if (daConta === null) return null
  const [ag] = await exec
    .select({
      lojaId:           agendamentos.lojaId,
      osId:             agendamentos.osId,
      mecanicoId:       agendamentos.mecanicoId,
      clienteId:        agendamentos.clienteId,
      clienteNome:      agendamentos.clienteNome,
      clienteFone:      agendamentos.clienteFone,
      tipoServico:      agendamentos.tipoServico,
      descricaoCliente: agendamentos.descricaoCliente,
    })
    .from(agendamentos)
    .where(and(eq(agendamentos.id, agendamentoId), daConta))
    .limit(1)
  if (!ag || !(await podeAgirNaLoja(usuario, ag.lojaId, exec))) return null
  return ag
}
