'use server'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { salvarContratoGrupo, type ResultadoSalvar } from '@/lib/contratos-grupo'

const ROTA = '/admin/contratos'

/** O grupo é sempre o ativo da sessão, nunca um id vindo da tela; a permissão é conferida em salvarContratoGrupo. */
export async function salvarContratoAction(categoria: string, texto: string): Promise<ResultadoSalvar> {
  const usuario = await getUsuarioLogado()
  if (!usuarioPodeAcessar(usuario, ROTA)) return { ok: false, erro: 'Sem permissão para editar o contrato' }
  const grupo = await grupoAtivoDaRequisicao(usuario)
  const r = await salvarContratoGrupo(usuario, { grupoId: grupo.id, categoria, texto })
  if (r.ok) revalidatePath(ROTA)
  return r
}
