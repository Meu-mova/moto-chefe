'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { inutilizarNumeroDaNota } from '@/lib/notagateway/inutilizar'
import { acao, RecusaUsuario } from '@/lib/resultado-action'

/**
 * Pede à Nota Gateway a inutilização do número da nota recusada (#597). Permissão, Conta e
 * a decisão ficam no servidor da #504. Sem revalidatePath: o diálogo mostra o resultado e a
 * tela só atualiza no Fechar, para a mensagem não sumir com a linha (C6).
 */
export async function pedirInutilizacaoAction(notaId: string, justificativa: string) {
  return acao(async () => {
    const r = await inutilizarNumeroDaNota(await getUsuarioLogado(), notaId, justificativa)
    if (!r.ok) throw new RecusaUsuario(r.erro)
    return { aviso: r.aviso }
  })
}
