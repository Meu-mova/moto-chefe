import { db } from '@/lib/db'
import { calendarioEventos, calendarioEventoUsuarios, calendarioCategorias, usuarios, lojas } from '@/lib/db/schema'
import { and, or, eq, ne, gte, lte, inArray, asc } from 'drizzle-orm'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { ocorrenciasNoIntervalo, podeVerEvento } from '@/lib/calendario'
import type { getUsuarioLogado } from '@/lib/auth'

type UsuarioLogado = Awaited<ReturnType<typeof getUsuarioLogado>>

export type OcorrenciaCalendario = {
  id: string
  titulo: string
  descricao: string | null
  categoriaId: string
  categoriaNome: string
  cor: string
  inicio: string        // início da ocorrência (YYYY-MM-DD)
  fim: string           // fim da ocorrência (YYYY-MM-DD; = inicio nos de um dia)
  hora: string | null
  recorrencia: string
  visibilidade: string
  lojaId: string | null
  lojaNome: string | null
  criadoPor: string
  criadoPorNome: string | null
  ancoraInicio: string  // datas cadastradas (para edição)
  ancoraFim: string
  participantesIds: string[]
}

function pad(n: number) { return String(n).padStart(2, '0') }
function diasNoMes(y: number, m: number) { return new Date(Date.UTC(y, m, 0)).getUTCDate() }

/** 'YYYY-MM-DD' de hoje no fuso de Brasília (o servidor roda em UTC). */
export function hojeBRT(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
}

/** Soma dias a uma data 'YYYY-MM-DD' sem passar por fuso. */
export function somarDias(yyyyMmDd: string, dias: number): string {
  const [y, m, d] = yyyyMmDd.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + dias))
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`
}

async function carregarOcorrencias(
  usuario: UsuarioLogado,
  inicio: string,
  fim: string,
): Promise<OcorrenciaCalendario[]> {
  const grupo = await getGrupoAtivo(usuario)

  const eventos = await db
    .select({
      id:            calendarioEventos.id,
      titulo:        calendarioEventos.titulo,
      descricao:     calendarioEventos.descricao,
      categoriaId:   calendarioEventos.categoriaId,
      categoriaNome: calendarioCategorias.nome,
      cor:           calendarioCategorias.cor,
      dataInicio:    calendarioEventos.dataInicio,
      dataFim:       calendarioEventos.dataFim,
      hora:          calendarioEventos.hora,
      recorrencia:   calendarioEventos.recorrencia,
      visibilidade:  calendarioEventos.visibilidade,
      lojaId:        calendarioEventos.lojaId,
      lojaNome:      lojas.nome,
      criadoPor:     calendarioEventos.criadoPor,
      criadoPorNome: usuarios.nome,
    })
    .from(calendarioEventos)
    .innerJoin(calendarioCategorias, eq(calendarioEventos.categoriaId, calendarioCategorias.id))
    .leftJoin(lojas, eq(calendarioEventos.lojaId, lojas.id))
    .leftJoin(usuarios, eq(calendarioEventos.criadoPor, usuarios.id))
    .where(and(
      eq(calendarioEventos.grupoId, grupo.id),
      or(
        ne(calendarioEventos.recorrencia, 'nenhuma'),
        and(gte(calendarioEventos.dataFim, inicio), lte(calendarioEventos.dataInicio, fim)),
      ),
    ))

  if (eventos.length === 0) return []

  const idsUsuarios = eventos.filter(e => e.visibilidade === 'usuarios').map(e => e.id)
  const participantesPorEvento = new Map<string, Set<string>>()
  if (idsUsuarios.length > 0) {
    const rows = await db
      .select({ eventoId: calendarioEventoUsuarios.eventoId, usuarioId: calendarioEventoUsuarios.usuarioId })
      .from(calendarioEventoUsuarios)
      .where(inArray(calendarioEventoUsuarios.eventoId, idsUsuarios))
    for (const r of rows) {
      if (!participantesPorEvento.has(r.eventoId)) participantesPorEvento.set(r.eventoId, new Set())
      participantesPorEvento.get(r.eventoId)!.add(r.usuarioId)
    }
  }

  const out: OcorrenciaCalendario[] = []
  for (const e of eventos) {
    const participantes = participantesPorEvento.get(e.id) ?? new Set<string>()
    if (!podeVerEvento(usuario, e, participantes)) continue
    const spans = ocorrenciasNoIntervalo({ dataInicio: e.dataInicio, dataFim: e.dataFim, recorrencia: e.recorrencia }, inicio, fim)
    for (const s of spans) {
      out.push({
        id: e.id, titulo: e.titulo, descricao: e.descricao,
        categoriaId: e.categoriaId, categoriaNome: e.categoriaNome, cor: e.cor,
        inicio: s.inicio, fim: s.fim, hora: e.hora, recorrencia: e.recorrencia,
        visibilidade: e.visibilidade, lojaId: e.lojaId, lojaNome: e.lojaNome,
        criadoPor: e.criadoPor, criadoPorNome: e.criadoPorNome,
        ancoraInicio: e.dataInicio, ancoraFim: e.dataFim, participantesIds: [...participantes],
      })
    }
  }

  out.sort((a, b) => a.inicio.localeCompare(b.inicio) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.titulo.localeCompare(b.titulo))
  return out
}

/** Ocorrências do mês 'YYYY-MM'. */
export function listarEventosDoMes(usuario: UsuarioLogado, mes: string): Promise<OcorrenciaCalendario[]> {
  const [y, m] = mes.split('-').map(Number)
  return carregarOcorrencias(usuario, `${mes}-01`, `${mes}-${pad(diasNoMes(y, m))}`)
}

/** Próximas ocorrências a partir de hoje, para o card do dashboard. */
export async function proximosEventos(usuario: UsuarioLogado, dias = 14): Promise<OcorrenciaCalendario[]> {
  const inicio = hojeBRT()
  return carregarOcorrencias(usuario, inicio, somarDias(inicio, dias))
}

/** Usuários do grupo ativo, para o seletor de "usuários específicos". */
export async function listarUsuariosDoGrupo(usuario: UsuarioLogado): Promise<{ id: string; nome: string }[]> {
  const lojaIds = await listarLojaIdsDoGrupoAtivo(usuario)
  if (lojaIds.length === 0) return []
  return db
    .select({ id: usuarios.id, nome: usuarios.nome })
    .from(usuarios)
    .where(inArray(usuarios.lojaId, lojaIds))
    .orderBy(asc(usuarios.nome))
}

/** Categorias ativas do grupo ativo, para o formulário de evento. */
export async function listarCategoriasAtivas(usuario: UsuarioLogado): Promise<{ id: string; nome: string; cor: string }[]> {
  const grupo = await getGrupoAtivo(usuario)
  return db
    .select({ id: calendarioCategorias.id, nome: calendarioCategorias.nome, cor: calendarioCategorias.cor })
    .from(calendarioCategorias)
    .where(and(eq(calendarioCategorias.grupoId, grupo.id), eq(calendarioCategorias.ativo, true)))
    .orderBy(asc(calendarioCategorias.ordem), asc(calendarioCategorias.nome))
}
