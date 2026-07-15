'use server'
import { db } from '@/lib/db'
import { funcionariosConfig, premiacaoFaixas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']

async function checarAdmin() {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')
  return getGrupoAtivo(u)
}

export async function salvarConfigFuncionarioAction(usuarioId: string, dados: {
  salario: number
  comissaoPercentual: number
  ajudaCusto: number | null
  ativo: boolean
}) {
  await checarAdmin()
  if (dados.salario < 0 || dados.comissaoPercentual < 0 || (dados.ajudaCusto ?? 0) < 0) {
    throw new Error('Valores não podem ser negativos')
  }
  await db.insert(funcionariosConfig).values({
    usuarioId,
    salario: String(dados.salario),
    comissaoPercentual: String(dados.comissaoPercentual),
    ajudaCusto: dados.ajudaCusto != null ? String(dados.ajudaCusto) : null,
    ativo: dados.ativo,
  }).onConflictDoUpdate({
    target: funcionariosConfig.usuarioId,
    set: {
      salario: String(dados.salario),
      comissaoPercentual: String(dados.comissaoPercentual),
      ajudaCusto: dados.ajudaCusto != null ? String(dados.ajudaCusto) : null,
      ativo: dados.ativo,
      atualizadoEm: new Date(),
    },
  })
  revalidatePath('/folha-pagamento')
}

export async function criarFaixaPremiacaoAction(valorMinimoVendas: number, premiacao: number) {
  const grupo = await checarAdmin()
  if (valorMinimoVendas < 0 || premiacao < 0) throw new Error('Valores não podem ser negativos')
  await db.insert(premiacaoFaixas).values({
    grupoId: grupo.id,
    valorMinimoVendas: String(valorMinimoVendas),
    premiacao: String(premiacao),
  })
  revalidatePath('/folha-pagamento')
}

export async function editarFaixaPremiacaoAction(id: string, valorMinimoVendas: number, premiacao: number) {
  const grupo = await checarAdmin()
  if (valorMinimoVendas < 0 || premiacao < 0) throw new Error('Valores não podem ser negativos')
  await db.update(premiacaoFaixas).set({
    valorMinimoVendas: String(valorMinimoVendas),
    premiacao: String(premiacao),
  }).where(and(eq(premiacaoFaixas.id, id), eq(premiacaoFaixas.grupoId, grupo.id)))
  revalidatePath('/folha-pagamento')
}

export async function excluirFaixaPremiacaoAction(id: string) {
  const grupo = await checarAdmin()
  await db.delete(premiacaoFaixas).where(and(eq(premiacaoFaixas.id, id), eq(premiacaoFaixas.grupoId, grupo.id)))
  revalidatePath('/folha-pagamento')
}
