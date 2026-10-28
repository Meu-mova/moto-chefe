'use server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { acao, RecusaUsuario } from '@/lib/resultado-action'
import {
  criarMaquininha, editarMaquininha, definirMaquininhaAtiva, type DadosMaquininha,
} from '@/lib/maquininhas-admin'

// O grupo é sempre o ativo do usuário, nunca um id vindo da tela.
async function grupoDoGestor() {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, '/admin/maquininhas')) throw new RecusaUsuario('Sem permissão')
  return (await getGrupoAtivo(usuario)).id
}

function revalidar() {
  revalidatePath('/admin/maquininhas')
  revalidatePath('/conciliacao')
}

export async function criarMaquininhaAction(dados: DadosMaquininha) {
  return acao(async () => {
    await criarMaquininha(db, await grupoDoGestor(), dados)
    revalidar()
  })
}

export async function editarMaquininhaAction(id: string, dados: DadosMaquininha) {
  return acao(async () => {
    await editarMaquininha(db, await grupoDoGestor(), id, dados)
    revalidar()
  })
}

export async function definirMaquininhaAtivaAction(id: string, ativo: boolean) {
  return acao(async () => {
    await definirMaquininhaAtiva(db, await grupoDoGestor(), id, ativo)
    revalidar()
  })
}
