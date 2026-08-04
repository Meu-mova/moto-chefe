import { db } from '@/lib/db'
import { calendarioEventos, calendarioEventoUsuarios, usuarios, lojas } from '@/lib/db/schema'
import { and, or, eq, ne, gte, lte, inArray, asc } from 'drizzle-orm'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { ocorrenciasNoIntervalo, podeVerEvento } from '@/lib/calendario'
import type { getUsuarioLogado } from '@/lib/auth'

type UsuarioLogado = Awaited<ReturnType<typeof getUsuarioLogado>>

export type OcorrenciaCalendario = {
  id: string
  titulo: string
  descricao: string | null
  categoria: string
  data: string          // data efetiva da ocorrência (YYYY-MM-DD)
  hora: string | null
  recorrencia: string
  visibilidade: string
  lojaId: string | null
  lojaNome: string | null
  criadoPor: string
  criadoPorNome: string | null
  dataAncora: string    // data cadastrada (1ª ocorrência)
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

/** Carrega ocorrências visíveis ao usuário dentro de [inicio, fim] do grupo ativo. */
async function carregarOcorrencias(
  usuario: UsuarioLogado,
  inicio: string,
  fim: string,
): Promise<OcorrenciaCalendario[]> {
  const grupo = await getGrupoAtivo(usuario)

  // (a) não recorrentes na janela + (b) todos os recorrentes do grupo (volume baixo).
  const eventos = await db
    .select({
      id:            calendarioEventos.id,
      titulo:        calendarioEventos.titulo,
      descricao:     calendarioEventos.descricao,
      categoria:     calendarioEventos.categoria,
      data:          calendarioEventos.data,
      hora:          calendarioEventos.hora,
      recorrencia:   calendarioEventos.recorrencia,
      visibilidade:  calendarioEventos.visibilidade,
      lojaId:        calendarioEventos.lojaId,
      lojaNome:      lojas.nome,
      criadoPor:     calendarioEventos.criadoPor,
      criadoPorNome: usuarios.nome,
    })
    .from(calendarioEventos)
    .leftJoin(lojas, eq(calendarioEventos.lojaId, lojas.id))
    .leftJoin(usuarios, eq(calendarioEventos.criadoPor, usuarios.id))
    .where(and(
      eq(calendarioEventos.grupoId, grupo.id),
      or(
        ne(calendarioEventos.recorrencia, 'nenhuma'),
        and(gte(calendarioEventos.data, inicio), lte(calendarioEventos.data, fim)),
      ),
    ))

  if (eventos.length === 0) return []

  // Participantes só dos eventos com visibilidade 'usuarios'.
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
    for (const data of ocorrenciasNoIntervalo({ data: e.data, recorrencia: e.recorrencia }, inicio, fim)) {
      out.push({
        id: e.id, titulo: e.titulo, descricao: e.descricao, categoria: e.categoria,
        data, hora: e.hora, recorrencia: e.recorrencia, visibilidade: e.visibilidade,
        lojaId: e.lojaId, lojaNome: e.lojaNome, criadoPor: e.criadoPor, criadoPorNome: e.criadoPorNome,
        dataAncora: e.data, participantesIds: [...participantes],
      })
    }
  }

  out.sort((a, b) => a.data.localeCompare(b.data) || (a.hora ?? '').localeCompare(b.hora ?? '') || a.titulo.localeCompare(b.titulo))
  return out
}

/** Ocorrências do mês 'YYYY-MM'. */
export function listarEventosDoMes(usuario: UsuarioLogado, mes: string): Promise<OcorrenciaCalendario[]> {
  const [y, m] = mes.split('-').map(Number)
  const inicio = `${mes}-01`
  const fim = `${mes}-${pad(diasNoMes(y, m))}`
  return carregarOcorrencias(usuario, inicio, fim)
}

/** Próximas ocorrências a partir de hoje, para o card do dashboard. */
export async function proximosEventos(usuario: UsuarioLogado, dias = 14): Promise<OcorrenciaCalendario[]> {
  const inicio = hojeBRT()
  const fim = somarDias(inicio, dias)
  return carregarOcorrencias(usuario, inicio, fim)
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
