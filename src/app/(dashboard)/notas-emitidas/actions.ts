'use server'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { inutilizarNumeroDaNota } from '@/lib/notagateway/inutilizar'
import { acao, RecusaUsuario } from '@/lib/resultado-action'

/** Pede à Nota Gateway a inutilização do número da nota recusada (#597). Permissão e Conta: no servidor da #504. */
export async function pedirInutilizacaoAction(notaId: string, justificativa: string) {
  return acao(async () => {
    const usuario = await getUsuarioLogado()
    let r: Awaited<ReturnType<typeof inutilizarNumeroDaNota>>
    try {
      r = await inutilizarNumeroDaNota(usuario, notaId, justificativa)
    } catch {
      // 5xx ou rede: o pedido já está gravado como pendente e a consulta decide (#504).
      revalidatePath('/notas-emitidas')
      throw new RecusaUsuario('A Nota Gateway não respondeu. O pedido ficou pendente; confira o resultado mais tarde.')
    }
    if (!r.ok) throw new RecusaUsuario(r.erro)
    revalidatePath('/notas-emitidas')
  })
}
