'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { calendarioEventos, calendarioEventoUsuarios, calendarioCategorias, usuarios } from '@/lib/db/schema'
import { and, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import {
  RECORRENCIAS, VISIBILIDADES, podeEditarEvento,
  type CalendarioRecorrencia, type CalendarioVisibilidade,
} from '@/lib/calendario'

export type EventoInput = {
  titulo: string
  descricao?: string | null
  categoriaId: string
  dataInicio: string
  dataFim?: string | null
  hora?: string | null
  recorrencia: string
  visibilidade: string
  lojaId?: string | null
  usuarioIds?: string[]
}

type Normalizado = {
  titulo: string
  descricao: string | null
  categoriaId: string
  dataInicio: string
  dataFim: string
  hora: string | null
  recorrencia: CalendarioRecorrencia
  visibilidade: CalendarioVisibilidade
  lojaId: string | null
  usuarioIds: string[]
}

async function validar(input: EventoInput, usuario: Awaited<ReturnType<typeof getUsuarioLogado>>): Promise<Normalizado> {
  const titulo = input.titulo?.trim()
  if (!titulo) throw new Error('Informe o título do evento')

  if (!RECORRENCIAS.includes(input.recorrencia as CalendarioRecorrencia)) throw new Error('Recorrência inválida')
  if (!VISIBILIDADES.includes(input.visibilidade as CalendarioVisibilidade)) throw new Error('Visibilidade inválida')

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataInicio ?? '')) throw new Error('Data de início inválida')
  const dataFim = input.dataFim?.trim() || input.dataInicio
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dataFim)) throw new Error('Data de fim inválida')
  if (dataFim < input.dataInicio) throw new Error('A data de fim não pode ser antes do início')

  const hora = input.hora?.trim() || null
  if (hora && !/^\d{2}:\d{2}$/.test(hora)) throw new Error('Horário inválido (use HH:MM)')

  const grupo = await getGrupoAtivo(usuario)
  const [categoria] = await db
    .select({ id: calendarioCategorias.id })
    .from(calendarioCategorias)
    .where(and(
      eq(calendarioCategorias.id, input.categoriaId ?? ''),
      eq(calendarioCategorias.grupoId, grupo.id),
      eq(calendarioCategorias.ativo, true),
    ))
    .limit(1)
  if (!categoria) throw new Error('Categoria inválida')

  const visibilidade = input.visibilidade as CalendarioVisibilidade
  let lojaId: string | null = null
  let usuarioIds: string[] = []

  if (visibilidade === 'loja') {
    const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
    lojaId = input.lojaId ?? usuario.lojaId ?? null
    if (!lojaId) throw new Error('Escolha a loja do evento')
    if (!lojaIdsGrupo.includes(lojaId)) throw new Error('Loja não pertence ao grupo')
  }

  if (visibilidade === 'usuarios') {
    const ids = [...new Set(input.usuarioIds ?? [])]
    if (ids.length === 0) throw new Error('Escolha ao menos um usuário')
    const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
    const validos = lojaIdsGrupo.length === 0 ? [] : await db
      .select({ id: usuarios.id })
      .from(usuarios)
      .where(and(inArray(usuarios.id, ids), inArray(usuarios.lojaId, lojaIdsGrupo)))
    const setValidos = new Set(validos.map(v => v.id))
    if (ids.some(id => !setValidos.has(id))) throw new Error('Usuário fora do grupo')
    usuarioIds = ids
  }

  return {
    titulo: titulo.slice(0, 200),
    descricao: input.descricao?.trim().slice(0, 2000) || null,
    categoriaId: input.categoriaId,
    dataInicio: input.dataInicio,
    dataFim,
    hora,
    recorrencia: input.recorrencia as CalendarioRecorrencia,
    visibilidade,
    lojaId,
    usuarioIds,
  }
}

export async function criarEventoAction(input: EventoInput) {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)
  const v = await validar(input, usuario)

  await db.transaction(async (tx) => {
    const [ev] = await tx.insert(calendarioEventos).values({
      grupoId:      grupo.id,
      titulo:       v.titulo,
      descricao:    v.descricao,
      categoriaId:  v.categoriaId,
      dataInicio:   v.dataInicio,
      dataFim:      v.dataFim,
      hora:         v.hora,
      recorrencia:  v.recorrencia,
      visibilidade: v.visibilidade,
      lojaId:       v.lojaId,
      criadoPor:    usuario.id,
    }).returning({ id: calendarioEventos.id })

    if (v.visibilidade === 'usuarios' && v.usuarioIds.length > 0) {
      await tx.insert(calendarioEventoUsuarios).values(
        v.usuarioIds.map(usuarioId => ({ eventoId: ev.id, usuarioId })),
      )
    }
  })

  revalidatePath('/calendario')
  revalidatePath('/dashboard')
}

export async function editarEventoAction(id: string, input: EventoInput) {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  const [atual] = await db.select().from(calendarioEventos).where(eq(calendarioEventos.id, id)).limit(1)
  if (!atual || atual.grupoId !== grupo.id) throw new Error('Evento não encontrado')
  if (!podeEditarEvento(usuario, { criadoPor: atual.criadoPor })) throw new Error('Sem permissão para editar este evento')

  const v = await validar(input, usuario)

  await db.transaction(async (tx) => {
    await tx.update(calendarioEventos).set({
      titulo:       v.titulo,
      descricao:    v.descricao,
      categoriaId:  v.categoriaId,
      dataInicio:   v.dataInicio,
      dataFim:      v.dataFim,
      hora:         v.hora,
      recorrencia:  v.recorrencia,
      visibilidade: v.visibilidade,
      lojaId:       v.lojaId,
    }).where(eq(calendarioEventos.id, id))

    await tx.delete(calendarioEventoUsuarios).where(eq(calendarioEventoUsuarios.eventoId, id))
    if (v.visibilidade === 'usuarios' && v.usuarioIds.length > 0) {
      await tx.insert(calendarioEventoUsuarios).values(
        v.usuarioIds.map(usuarioId => ({ eventoId: id, usuarioId })),
      )
    }
  })

  revalidatePath('/calendario')
  revalidatePath('/dashboard')
}

export async function excluirEventoAction(id: string) {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)

  const [atual] = await db.select().from(calendarioEventos).where(eq(calendarioEventos.id, id)).limit(1)
  if (!atual || atual.grupoId !== grupo.id) throw new Error('Evento não encontrado')
  if (!podeEditarEvento(usuario, { criadoPor: atual.criadoPor })) throw new Error('Sem permissão para excluir este evento')

  await db.delete(calendarioEventos).where(eq(calendarioEventos.id, id))
  revalidatePath('/calendario')
  revalidatePath('/dashboard')
}
