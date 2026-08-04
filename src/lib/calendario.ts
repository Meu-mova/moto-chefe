// ─── Lógica pura do Calendário de gestão (sem banco, testável) ─────────────────
// Ver docs/superpowers/specs/2026-08-04-calendario-design.md.
//
// Datas são strings de calendário 'YYYY-MM-DD'. Comparar strings nesse formato
// já é comparação cronológica (lexicográfica = ordem de data), então não usamos
// `Date` em lugar nenhum aqui — evita o bug de fuso ("YYYY-MM-DD" no new Date()
// vira 21h do dia anterior em Brasília).

export const CATEGORIAS = ['pagamento', 'aniversario', 'evento', 'ausencia_socio', 'outro'] as const
export type CalendarioCategoria = typeof CATEGORIAS[number]

export const RECORRENCIAS = ['nenhuma', 'anual', 'mensal'] as const
export type CalendarioRecorrencia = typeof RECORRENCIAS[number]

export const VISIBILIDADES = ['grupo', 'loja', 'socios', 'gestao', 'usuarios'] as const
export type CalendarioVisibilidade = typeof VISIBILIDADES[number]

export const CATEGORIA_META: Record<CalendarioCategoria, { label: string; dot: string; chip: string }> = {
  pagamento:      { label: 'Pagamento',        dot: 'bg-rose-500',    chip: 'bg-rose-50 text-rose-700 border-rose-200' },
  aniversario:    { label: 'Aniversário',      dot: 'bg-pink-500',    chip: 'bg-pink-50 text-pink-700 border-pink-200' },
  evento:         { label: 'Evento',           dot: 'bg-blue-500',    chip: 'bg-blue-50 text-blue-700 border-blue-200' },
  ausencia_socio: { label: 'Ausência de sócio', dot: 'bg-amber-500',   chip: 'bg-amber-50 text-amber-700 border-amber-200' },
  outro:          { label: 'Outro',            dot: 'bg-slate-400',   chip: 'bg-slate-50 text-slate-600 border-slate-200' },
}

export const VISIBILIDADE_META: Record<CalendarioVisibilidade, { label: string; descricao: string }> = {
  grupo:    { label: 'Todos do grupo',    descricao: 'Todo mundo do grupo vê' },
  loja:     { label: 'Só a minha loja',   descricao: 'Apenas quem é da mesma loja' },
  socios:   { label: 'Só sócios',         descricao: 'admin_geral e admin_socio' },
  gestao:   { label: 'Gestão',            descricao: 'Sócios + aux_adm' },
  usuarios: { label: 'Usuários específicos', descricao: 'Só as pessoas escolhidas' },
}

export const RECORRENCIA_META: Record<CalendarioRecorrencia, string> = {
  nenhuma: 'Não repete',
  anual:   'Todo ano',
  mensal:  'Todo mês',
}

// ─── Visibilidade ──────────────────────────────────────────────────────────────

type UsuarioVis = { id: string; papel: string; lojaId: string | null }
type EventoVis  = { visibilidade: string; lojaId: string | null; criadoPor: string }

/** Decide se o usuário pode ver o evento. A checagem de grupo é feita na query. */
export function podeVerEvento(u: UsuarioVis, e: EventoVis, participantes: Set<string>): boolean {
  if (e.criadoPor === u.id) return true                                    // sempre vê o que criou
  if (u.papel === 'admin_geral' || u.papel === 'admin_socio') return true  // sócios veem tudo
  switch (e.visibilidade) {
    case 'grupo':    return true
    case 'loja':     return !!u.lojaId && u.lojaId === e.lojaId
    case 'socios':   return false                                          // não-sócio já caiu fora acima
    case 'gestao':   return u.papel === 'aux_adm'
    case 'usuarios': return participantes.has(u.id)
    default:         return false
  }
}

/** Quem pode editar/excluir: o criador ou um sócio. */
export function podeEditarEvento(u: UsuarioVis, e: { criadoPor: string }): boolean {
  return e.criadoPor === u.id || u.papel === 'admin_geral' || u.papel === 'admin_socio'
}

// ─── Recorrência ───────────────────────────────────────────────────────────────

function parseYmd(s: string): [number, number, number] {
  const [y, m, d] = s.split('-').map(Number)
  return [y, m, d]
}
function pad(n: number): string { return String(n).padStart(2, '0') }
function ymd(y: number, m: number, d: number): string { return `${y}-${pad(m)}-${pad(d)}` }
function diasNoMes(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate() }

/**
 * Datas 'YYYY-MM-DD' em que o evento ocorre dentro de [inicio, fim].
 * - nenhuma: a própria data, se cair na janela.
 * - anual/mensal: expande a partir da âncora (nunca antes dela); dia inexistente
 *   (29/02 fora de bissexto, dia 31 em mês curto) cai para o último dia do mês.
 */
export function ocorrenciasNoIntervalo(
  evento: { data: string; recorrencia: string },
  inicio: string,
  fim: string,
): string[] {
  if (inicio > fim) return []
  const ancora = evento.data

  if (evento.recorrencia === 'nenhuma') {
    return ancora >= inicio && ancora <= fim ? [ancora] : []
  }

  const [ay, am, ad] = parseYmd(ancora)
  const [iy, im] = parseYmd(inicio)
  const [fy, fm] = parseYmd(fim)
  const out: string[] = []

  const dentro = (occ: string) => occ >= inicio && occ <= fim && occ >= ancora

  if (evento.recorrencia === 'anual') {
    const yStart = Math.max(ay, iy)
    for (let y = yStart; y <= fy; y++) {
      const dia = Math.min(ad, diasNoMes(y, am))
      const occ = ymd(y, am, dia)
      if (dentro(occ)) out.push(occ)
    }
    return out
  }

  if (evento.recorrencia === 'mensal') {
    const ancoraIdx = ay * 12 + (am - 1)
    const inicioIdx = iy * 12 + (im - 1)
    const fimIdx = fy * 12 + (fm - 1)
    for (let idx = Math.max(ancoraIdx, inicioIdx); idx <= fimIdx; idx++) {
      const y = Math.floor(idx / 12)
      const m = (idx % 12) + 1
      const dia = Math.min(ad, diasNoMes(y, m))
      const occ = ymd(y, m, dia)
      if (dentro(occ)) out.push(occ)
    }
    return out
  }

  return []
}
