'use server'
import { db } from '@/lib/db'
import { modelos, modeloBlingCodigos, modeloApelidos } from '@/lib/db/schema'
import { eq, and, ne, inArray } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'
import { normalizarModelo } from '@/lib/nfe-entrada'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function criarModeloAction(formData: FormData) {
  await assertAdmin()
  await db.insert(modelos).values({
    marca: formData.get('marca') as string,
    modelo: formData.get('modelo') as string,
    categoria: formData.get('categoria') as any,
    potenciaW: formData.get('potencia_w') as string,
    // Motor e velocidade máx. não são do modelo (motor vem por moto no XML;
    // velocidade não é usada). Colunas NOT NULL, então gravam vazio.
    motor: '',
    velocidadeMax: '',
  })
  revalidatePath('/admin/modelos')
}

export async function editarModeloAction(id: string, formData: FormData) {
  await assertAdmin()
  // `motor` e `velocidadeMax` ficam de fora do set de propósito — preservam o
  // valor dos modelos antigos que ainda os têm preenchidos.
  await db.update(modelos).set({
    marca: formData.get('marca') as string,
    modelo: formData.get('modelo') as string,
    categoria: formData.get('categoria') as any,
    potenciaW: formData.get('potencia_w') as string,
  }).where(eq(modelos.id, id))
  revalidatePath('/admin/modelos')
}

export async function atualizarBlingCodigoAction(modeloId: string, codigo: string) {
  const u = await assertAdmin()
  const grupo = await getGrupoAtivo(u)

  if (!codigo.trim()) {
    await db.delete(modeloBlingCodigos)
      .where(and(eq(modeloBlingCodigos.modeloId, modeloId), eq(modeloBlingCodigos.grupoId, grupo.id)))
  } else {
    await db.insert(modeloBlingCodigos)
      .values({ modeloId, grupoId: grupo.id, codigo: codigo.trim() })
      .onConflictDoUpdate({
        target: [modeloBlingCodigos.modeloId, modeloBlingCodigos.grupoId],
        set: { codigo: codigo.trim() },
      })
  }
  revalidatePath('/admin/modelos')
}

/**
 * Cadastra os apelidos que as notas de entrada usam para um modelo.
 *
 * Existe porque o `infCpl` de alguns fornecedores usa um nome que não está no
 * catálogo — a LAIOUNS escreve "DRIFT" para o DRIFT CAR e "G5" para o PATINETE
 * G5 — e sem o de-para o chassi não encontra a ficha fiscal do item. Não dá
 * para resolver por semelhança de texto: adivinhar ali daria a classificação
 * de outro produto à moto.
 *
 * Recebe a lista inteira do modelo e substitui: é o que a edição inline manda,
 * e assim apagar um apelido é só tirá-lo do campo. Apelido já usado por OUTRO
 * modelo é recusado com o nome do dono — deixar passar reintroduziria a
 * ambiguidade que a tabela existe para eliminar.
 */
export async function salvarApelidosAction(modeloId: string, texto: string) {
  await assertAdmin()

  const apelidos = [...new Set(
    texto.split(',').map(a => normalizarModelo(a)).filter(Boolean),
  )]

  const conflitos = apelidos.length
    ? await db
        .select({ apelido: modeloApelidos.apelido, modelo: modelos.modelo })
        .from(modeloApelidos)
        .innerJoin(modelos, eq(modelos.id, modeloApelidos.modeloId))
        .where(and(
          inArray(modeloApelidos.apelido, apelidos),
          ne(modeloApelidos.modeloId, modeloId),
        ))
    : []

  if (conflitos.length) {
    const lista = conflitos.map(c => `"${c.apelido}" já é do ${c.modelo}`).join('; ')
    throw new Error(lista)
  }

  await db.transaction(async tx => {
    await tx.delete(modeloApelidos).where(eq(modeloApelidos.modeloId, modeloId))
    if (apelidos.length) {
      await tx.insert(modeloApelidos).values(apelidos.map(apelido => ({ apelido, modeloId })))
    }
  })

  revalidatePath('/admin/modelos')
}
