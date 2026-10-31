import { and, eq } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { db } from '@/lib/db'
import { contas, grupos, lojas } from '@/lib/db/schema'
import { registrarAcaoSensivel } from '@/lib/log-acoes'

type Escritor = Pick<typeof db, 'select' | 'update' | 'insert' | 'delete' | 'transaction'>
type Leitor = Pick<typeof db, 'select'>

/**
 * Chave da Conta (#552): com ela, a moto anda entre os grupos da mesma Conta e a NF
 * de saída sai pelo grupo que comprou a moto. Substitui a exceção por e-mail.
 */
export async function transferenciaEntreGruposLigada(contaId: string | null | undefined, exec: Leitor = db): Promise<boolean> {
  if (!contaId) return false
  const [c] = await exec.select({ ligada: contas.transferenciaEntreGrupos }).from(contas).where(eq(contas.id, contaId)).limit(1)
  return c?.ligada ?? false
}

/**
 * Loja de destino de outro grupo: só se for da mesma Conta da loja da MOTO e com a chave
 * dessa Conta ligada. Nunca a Conta do usuário: sócio com grupo liberado de outra Conta
 * (#520) levaria a moto de uma Conta para a outra.
 */
export async function destinoEntreGruposPermitido(motoLojaId: string, lojaDestinoId: string, exec: Leitor = db): Promise<boolean> {
  const lojaMoto = alias(lojas, 'loja_moto')
  const grupoMoto = alias(grupos, 'grupo_moto')
  const [ok] = await exec.select({ id: lojas.id }).from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .innerJoin(grupoMoto, eq(grupoMoto.contaId, grupos.contaId))
    .innerJoin(lojaMoto, and(eq(lojaMoto.grupoId, grupoMoto.id), eq(lojaMoto.id, motoLojaId)))
    .innerJoin(contas, and(eq(contas.id, grupos.contaId), eq(contas.transferenciaEntreGrupos, true)))
    .where(eq(lojas.id, lojaDestinoId)).limit(1)
  return !!ok
}

export async function alterarTransferenciaEntreGrupos(
  usuario: { id: string; papel: string },
  contaId: string,
  ligada: boolean,
  exec: Escritor = db,
): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (usuario.papel !== 'admin_geral') return { ok: false, erro: 'Sem permissão' }
  return exec.transaction(async tx => {
    const [c] = await tx.select({ de: contas.transferenciaEntreGrupos, nome: contas.nome }).from(contas).where(eq(contas.id, contaId)).limit(1)
    if (!c) return { ok: false as const, erro: 'Conta não encontrada' }
    if (c.de === ligada) return { ok: true as const }
    await tx.update(contas).set({ transferenciaEntreGrupos: ligada }).where(eq(contas.id, contaId))
    await registrarAcaoSensivel({
      tipo: 'transferencia_grupos_alterada', usuarioId: usuario.id, contaId,
      detalhe: { contaId, contaNome: c.nome, de: c.de, para: ligada },
    }, tx)
    return { ok: true as const }
  })
}
