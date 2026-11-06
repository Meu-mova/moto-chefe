'use server'

// Casca do Arquivar moto (#688) e do Desarquivar (#691): confere a sessão e chama a função de banco, que decide tudo.
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { acao } from '@/lib/resultado-action'
import { arquivarMotos, desarquivarMotos, motosParaArquivar } from '@/lib/arquivar-motos'

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
