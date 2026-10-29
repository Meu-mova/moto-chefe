'use server'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { getUsuarioLogado } from '@/lib/auth'
import { contaDoGrupoAtivo } from '@/lib/grupo'
import { ehGestorDeUsuarios } from '@/lib/gestao-usuarios'
import { modulosQuePodeDar } from '@/lib/navegacao'
import { apagarCargo, criarCargo, editarCargo, type DadosCargo } from '@/lib/cargos'
import { CARGO_INDISPONIVEL, CARGOS_VISIVEIS } from '@/lib/cargos-opcoes'

type Resultado = { ok: true } | { ok: false; erro: string }

// O sócio só dá os módulos que ele mesmo vê; o servidor recalcula, a tela não decide.
async function sessao() {
  const usuario = await getUsuarioLogado()
  if (!ehGestorDeUsuarios(usuario)) return null
  return {
    quem: { papel: usuario.papel, contaId: await contaDoGrupoAtivo(usuario) },
    podeDar: modulosQuePodeDar(usuario, {}),
  }
}

const SEM_PERMISSAO = { ok: false, erro: 'Sem permissão para gerenciar cargos' } as const
const INDISPONIVEL = { ok: false, erro: CARGO_INDISPONIVEL } as const

export async function criarCargoAction(dados: DadosCargo): Promise<Resultado> {
  if (!CARGOS_VISIVEIS) return INDISPONIVEL
  const s = await sessao()
  if (!s) return SEM_PERMISSAO
  const r = await criarCargo(db, s.quem, dados, s.podeDar)
  if (!r.ok) return r
  revalidatePath('/admin/usuarios')
  return { ok: true }
}

export async function editarCargoAction(id: string, dados: DadosCargo): Promise<Resultado> {
  if (!CARGOS_VISIVEIS) return INDISPONIVEL
  const s = await sessao()
  if (!s) return SEM_PERMISSAO
  const r = await editarCargo(db, s.quem, id, dados, s.podeDar)
  if (r.ok) revalidatePath('/admin/usuarios')
  return r
}

export async function apagarCargoAction(id: string): Promise<Resultado> {
  if (!CARGOS_VISIVEIS) return INDISPONIVEL
  const s = await sessao()
  if (!s) return SEM_PERMISSAO
  const r = await apagarCargo(db, s.quem, id)
  if (r.ok) revalidatePath('/admin/usuarios')
  return r
}
