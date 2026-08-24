'use server'
import { db } from '@/lib/db'
import { metasLoja } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

// aux_adm entra junto: é quem toca a loja no dia a dia e cobra a meta.
const PAPEIS = ['admin_geral', 'admin_socio', 'aux_adm']

export type MetaEditada = { lojaId: string; valor: number | null }

/**
 * Salva a grade inteira de um mês: upsert das lojas com valor e DELETE das que
 * vieram vazias — meta apagada tira a loja do card, que é diferente de meta zero.
 *
 * As lojas são conferidas contra o grupo ativo antes de gravar. Server action é
 * endpoint público: sem essa checagem, um lojaId de outra bandeira passado à mão
 * escreveria a meta dela.
 */
export async function salvarMetasDoMesAction(
  ano: number, mes: number, linhas: MetaEditada[],
) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS.includes(usuario.papel)) throw new Error('Sem permissão')

  if (!Number.isInteger(ano) || ano < 2020 || ano > 2100) throw new Error('Ano inválido')
  if (!Number.isInteger(mes) || mes < 1 || mes > 12) throw new Error('Mês inválido')

  const lojaIdsGrupo = new Set(await listarLojaIdsDoGrupoAtivo(usuario))
  const forasteira = linhas.find(l => !lojaIdsGrupo.has(l.lojaId))
  if (forasteira) throw new Error('Loja fora do grupo ativo')

  for (const l of linhas) {
    if (l.valor !== null && (!isFinite(l.valor) || l.valor < 0)) {
      throw new Error('Meta inválida — informe um valor em reais, sem negativo')
    }
  }

  const comValor = linhas.filter(l => l.valor !== null && l.valor > 0)
  const semValor = linhas.filter(l => l.valor === null || l.valor === 0)

  await db.transaction(async tx => {
    for (const l of comValor) {
      await tx
        .insert(metasLoja)
        .values({
          lojaId: l.lojaId,
          ano,
          mes,
          valorMeta: String(l.valor),
          atualizadoPor: usuario.id,
        })
        .onConflictDoUpdate({
          target: [metasLoja.lojaId, metasLoja.ano, metasLoja.mes],
          set: { valorMeta: String(l.valor), atualizadoPor: usuario.id, atualizadoEm: new Date() },
        })
    }
    if (semValor.length > 0) {
      await tx.delete(metasLoja).where(and(
        inArray(metasLoja.lojaId, semValor.map(l => l.lojaId)),
        eq(metasLoja.ano, ano),
        eq(metasLoja.mes, mes),
      ))
    }
  })

  revalidatePath('/admin/metas')
  revalidatePath('/dashboard')
}

/**
 * Metas de um mês qualquer do grupo ativo — serve o botão "copiar do mês
 * anterior", que preenche os campos na tela sem salvar nada.
 */
export async function metasDoMesAction(ano: number, mes: number) {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS.includes(usuario.papel)) throw new Error('Sem permissão')

  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)
  if (lojaIds.length === 0) return []

  const linhas = await db
    .select({ lojaId: metasLoja.lojaId, valorMeta: metasLoja.valorMeta })
    .from(metasLoja)
    .where(and(
      inArray(metasLoja.lojaId, lojaIds),
      eq(metasLoja.ano, ano),
      eq(metasLoja.mes, mes),
    ))
  return linhas.map(l => ({ lojaId: l.lojaId, valor: Number(l.valorMeta) }))
}
