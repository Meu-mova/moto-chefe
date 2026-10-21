'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { db } from '@/lib/db'
import { motos, transferencias } from '@/lib/db/schema'
import { podeAbrirRegistroDaLoja, podeAgirNaLoja } from '@/lib/acesso-registro'
import { getGrupoIdDaLoja, podeTransferirEntreGrupos } from '@/lib/grupo'
import { grupoEstaNaConta } from '@/lib/conta'
import { eq } from 'drizzle-orm'

const ADMINS = ['admin_geral', 'admin_socio']

type Usuario = Awaited<ReturnType<typeof getUsuarioLogado>>

// aux_adm só pode responder por transferências destinadas à própria loja —
// a tela já esconde o botão pra outras lojas, mas isso reforça no servidor
// (antes só o RPC checava "status pendente", não a loja de quem responde).
// Admin responde só por destino em grupo que ele vê.
async function checarLojaDestino(usuario: Usuario, transferenciaId: string) {
  const [t] = await db
    .select({ lojaDestinoId: transferencias.lojaDestinoId })
    .from(transferencias)
    .where(eq(transferencias.id, transferenciaId))
    .limit(1)
  if (!t) throw new Error('Transferência não encontrada')
  if (ADMINS.includes(usuario.papel)) {
    if (!(await podeAbrirRegistroDaLoja(usuario, t.lojaDestinoId))) throw new Error('Transferência não encontrada')
    return
  }
  if (t.lojaDestinoId !== usuario.lojaId) {
    throw new Error('Sem permissão para responder transferência de outra loja')
  }
}

export async function solicitarTransferenciaAction(
  motoId: string,
  lojaDestinoId: string,
  observacao?: string
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão para solicitar transferência')
  }
  // A moto tem de ser da loja do usuário (admin: do grupo que vê), como na tela; o
  // destino, de grupo que ele vê, ou, pela exceção nominal, de qualquer grupo da Conta.
  const [moto] = await db.select({ lojaId: motos.lojaId }).from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto || !(await podeAgirNaLoja(usuario, moto.lojaId))) throw new Error('Moto não encontrada')
  const destinoOk = usuario.papel !== 'admin_geral' && podeTransferirEntreGrupos(usuario)
    ? await grupoEstaNaConta(await getGrupoIdDaLoja(lojaDestinoId), usuario.contaId)
    : await podeAbrirRegistroDaLoja(usuario, lojaDestinoId)
  if (!destinoOk) {
    throw new Error('Loja de destino fora do seu grupo')
  }
  const supabase = await createClient()
  const { error } = await supabase.rpc('solicitar_transferencia', {
    p_moto_id: motoId,
    p_loja_destino_id: lojaDestinoId,
    p_solicitado_por: usuario.id,
    p_observacao: observacao ?? null,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}

export async function aceitarTransferenciaAction(transferenciaId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para aceitar transferência')
  }
  await checarLojaDestino(usuario, transferenciaId)
  const supabase = await createClient()
  const { error } = await supabase.rpc('aceitar_transferencia', {
    p_transferencia_id: transferenciaId,
    p_respondido_por: usuario.id,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}

export async function recusarTransferenciaAction(transferenciaId: string, observacao: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão para recusar transferência')
  }
  await checarLojaDestino(usuario, transferenciaId)
  const supabase = await createClient()
  const { error } = await supabase.rpc('recusar_transferencia', {
    p_transferencia_id: transferenciaId,
    p_respondido_por: usuario.id,
    p_observacao: observacao,
  })
  if (error) throw new Error(error.message)
  revalidatePath('/transferencias')
  revalidatePath('/estoque')
}
