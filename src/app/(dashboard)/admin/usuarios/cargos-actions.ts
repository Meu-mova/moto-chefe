'use server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getUsuarioLogado } from '@/lib/auth'
import { contaDoGrupoAtivo } from '@/lib/grupo'
import { podeGerenciarCargos } from '@/lib/gestao-usuarios'
import { apagarCargo, criarCargo, editarCargo, type DadosCargo } from '@/lib/cargos'

type Resultado = { ok: true } | { ok: false; erro: string }

// A tela e o servidor decidem pela mesma função (podeGerenciarCargos).
async function sessao() {
  const usuario = await getUsuarioLogado()
  if (!podeGerenciarCargos(usuario)) return null
  return { papel: usuario.papel, contaId: await contaDoGrupoAtivo(usuario) }
}

const SEM_PERMISSAO = { ok: false, erro: 'Sem permissão para gerenciar cargos' } as const

export async function criarCargoAction(dados: DadosCargo): Promise<Resultado> {
  const s = await sessao()
  if (!s) return SEM_PERMISSAO
  const r = await criarCargo(db, s, dados)
  if (!r.ok) return r
  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function editarCargoAction(id: string, dados: DadosCargo): Promise<Resultado> {
  const s = await sessao()
  if (!s) return SEM_PERMISSAO
  const r = await editarCargo(db, s, id, dados)
  if (r.ok) revalidatePath('/admin/usuarios')
  return r
}

export async function apagarCargoAction(id: string): Promise<Resultado> {
  const s = await sessao()
  if (!s) return SEM_PERMISSAO
  const r = await apagarCargo(db, s, id)
  if (r.ok) revalidatePath('/admin/usuarios')
  return r
}
