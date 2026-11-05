'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { consultarInutilizacao, inutilizarNumeroDaNota, type Resultado } from '@/lib/notagateway/inutilizar'
import { conferirFaixa, contextoDaFaixa, inutilizarFaixa, type EntradaFaixa } from '@/lib/notagateway/inutilizar-faixa'
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

/** Recusa vira frase para o usuário; o grupo é sempre o ativo da sessão, nunca um id vindo da tela (#655). */
async function noGrupoAtivo<T extends object>(fn: (usuario: Awaited<ReturnType<typeof getUsuarioLogado>>, grupoId: string) => Promise<Resultado<T>>) {
  return acao(async () => {
    const usuario = await getUsuarioLogado()
    const r = await fn(usuario, (await grupoAtivoDaRequisicao(usuario)).id)
    if (!r.ok) throw new RecusaUsuario(r.erro)
    return r as Exclude<typeof r, { ok: false }>
  })
}

export async function contextoDaFaixaAction(ambiente: string) {
  return noGrupoAtivo((usuario, grupoId) => contextoDaFaixa(usuario, grupoId, ambiente))
}

export async function conferirFaixaAction(entrada: Omit<EntradaFaixa, 'chave'>) {
  return noGrupoAtivo((usuario, grupoId) => conferirFaixa(usuario, grupoId, entrada))
}

/** Sem revalidatePath: o diálogo mostra o resultado e a tela atualiza no Fechar. */
export async function pedirFaixaAction(entrada: EntradaFaixa) {
  return noGrupoAtivo((usuario, grupoId) => inutilizarFaixa(usuario, grupoId, entrada))
}

/** A consulta por id já filtra pela Conta (a mesma do pedido por nota). */
export async function consultarFaixaAction(id: string) {
  return noGrupoAtivo(async usuario => consultarInutilizacao(usuario, id))
}
