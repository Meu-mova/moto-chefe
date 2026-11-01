'use server'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { inutilizarNumeroDaNota } from '@/lib/notagateway/inutilizar'
import { acao, RecusaUsuario } from '@/lib/resultado-action'

/** Pede à Nota Gateway a inutilização do número da nota recusada (#597). Permissão e Conta: no servidor da #504. */
export async function pedirInutilizacaoAction(notaId: string, justificativa: string) {
  return acao(async () => {
    const r = await inutilizarNumeroDaNota(await getUsuarioLogado(), notaId, justificativa)
    // Recusa e envio sem resposta (pedido pendente) mudam a linha: a lista precisa refletir.
    revalidatePath('/notas-emitidas')
    if (!r.ok) throw new RecusaUsuario(r.erro)
  })
}
