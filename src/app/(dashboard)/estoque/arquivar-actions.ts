'use server'

// Casca do Arquivar moto (#688), do Desarquivar (#691) e do Remover moto (#692): confere a sessão e chama a função de banco, que decide tudo.
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { acao } from '@/lib/resultado-action'
import { arquivarMotos, desarquivarMotos, motosParaArquivar } from '@/lib/arquivar-motos'
import { motosParaRemover, removerMotos } from '@/lib/remover-motos'

export async function buscarMotosParaArquivarAction(termo: string) {
  return motosParaArquivar(await getUsuarioLogado(), termo)
}

export async function arquivarMotosAction(motoIds: string[], motivo: string) {
  const usuario = await getUsuarioLogado()
  const resultado = await acao(() => arquivarMotos(usuario, motoIds, motivo))
  if (resultado.ok) {
    revalidatePath('/estoque')
    revalidatePath('/radar')
  }
  return resultado
}

export async function desarquivarMotoAction(motoId: string, motivo: string) {
  const usuario = await getUsuarioLogado()
  const resultado = await acao(() => desarquivarMotos(usuario, [motoId], motivo))
  if (resultado.ok) {
    revalidatePath('/estoque')
    revalidatePath('/radar')
  }
  return resultado
}

export async function buscarMotosParaRemoverAction(termo: string) {
  return motosParaRemover(await getUsuarioLogado(), termo)
}

export async function removerMotosAction(motoIds: string[], motivo: string, confirmacao: string) {
  const usuario = await getUsuarioLogado()
  const resultado = await acao(() => removerMotos(usuario, motoIds, motivo, confirmacao))
  // Além da moto, saem OS, transferências e histórico; a NF de entrada pode voltar a pendente.
  if (resultado.ok) {
    for (const rota of ['/estoque', '/radar', '/ordens-servico', '/transferencias', '/agenda', '/radar-fiscal']) revalidatePath(rota)
  }
  return resultado
}
