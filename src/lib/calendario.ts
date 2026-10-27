// ─── Lógica pura do Calendário de gestão (sem banco, testável) ─────────────────
// Ver docs/superpowers/specs/2026-08-04-calendario-design.md.
//
// Datas são strings de calendário 'YYYY-MM-DD'. Comparar strings nesse formato
// já é comparação cronológica (lexicográfica = ordem de data), então não usamos
// `Date` para comparar — evita o bug de fuso ("YYYY-MM-DD" no new Date() vira 21h
// do dia anterior em Brasília). `Date.UTC` é usado só para aritmética de dias.

export const RECORRENCIAS = ['nenhuma', 'anual', 'mensal'] as const
export type CalendarioRecorrencia = typeof RECORRENCIAS[number]

export const VISIBILIDADES = ['grupo', 'loja', 'socios', 'gestao', 'usuarios'] as const
export type CalendarioVisibilidade = typeof VISIBILIDADES[number]

// ─── Paleta de cores das categorias ────────────────────────────────────────────
// As classes precisam aparecer literalmente aqui para o Tailwind incluí-las
// (não dá para montar nome de classe dinamicamente).
export const CORES = {
  rose:    { label: 'Vermelho', dot: 'bg-agenda-rose-ponto', chip: 'bg-agenda-rose-selo text-agenda-rose-selo-texto border-agenda-rose-selo-borda', swatch: 'bg-agenda-rose-ponto' },
  pink:    { label: 'Rosa',     dot: 'bg-agenda-pink-ponto', chip: 'bg-agenda-pink-selo text-agenda-pink-selo-texto border-agenda-pink-selo-borda', swatch: 'bg-agenda-pink-ponto' },
  orange:  { label: 'Laranja',  dot: 'bg-agenda-orange-ponto', chip: 'bg-agenda-orange-selo text-agenda-orange-selo-texto border-agenda-orange-selo-borda', swatch: 'bg-agenda-orange-ponto' },
  amber:   { label: 'Âmbar',    dot: 'bg-agenda-amber-ponto', chip: 'bg-agenda-amber-selo text-agenda-amber-selo-texto border-agenda-amber-selo-borda', swatch: 'bg-agenda-amber-ponto' },
  emerald: { label: 'Verde',    dot: 'bg-agenda-emerald-ponto', chip: 'bg-agenda-emerald-selo text-agenda-emerald-selo-texto border-agenda-emerald-selo-borda', swatch: 'bg-agenda-emerald-ponto' },
  teal:    { label: 'Turquesa', dot: 'bg-agenda-teal-ponto', chip: 'bg-agenda-teal-selo text-agenda-teal-selo-texto border-agenda-teal-selo-borda', swatch: 'bg-agenda-teal-ponto' },
  cyan:    { label: 'Ciano',    dot: 'bg-agenda-cyan-ponto', chip: 'bg-agenda-cyan-selo text-agenda-cyan-selo-texto border-agenda-cyan-selo-borda', swatch: 'bg-agenda-cyan-ponto' },
  blue:    { label: 'Azul',     dot: 'bg-agenda-blue-ponto', chip: 'bg-agenda-blue-selo text-agenda-blue-selo-texto border-agenda-blue-selo-borda', swatch: 'bg-agenda-blue-ponto' },
  violet:  { label: 'Roxo',     dot: 'bg-agenda-violet-ponto', chip: 'bg-agenda-violet-selo text-agenda-violet-selo-texto border-agenda-violet-selo-borda', swatch: 'bg-agenda-violet-ponto' },
  fuchsia: { label: 'Magenta',  dot: 'bg-agenda-fuchsia-ponto', chip: 'bg-agenda-fuchsia-selo text-agenda-fuchsia-selo-texto border-agenda-fuchsia-selo-borda', swatch: 'bg-agenda-fuchsia-ponto' },
  slate:   { label: 'Cinza',    dot: 'bg-agenda-slate-ponto', chip: 'bg-agenda-slate-selo text-agenda-slate-selo-texto border-agenda-slate-selo-borda', swatch: 'bg-agenda-slate-ponto' },
} as const

export type CorCategoria = keyof typeof CORES
export const CORES_KEYS = Object.keys(CORES) as CorCategoria[]

export function corMeta(cor: string) {
  return CORES[cor as CorCategoria] ?? CORES.slate
}

export const RECORRENCIA_META: Record<CalendarioRecorrencia, string> = {
  nenhuma: 'Não repete',
  anual:   'Todo ano',
  mensal:  'Todo mês',
}

export const VISIBILIDADE_META: Record<CalendarioVisibilidade, { label: string; descricao: string }> = {
  grupo:    { label: 'Todos do grupo',    descricao: 'Todo mundo do grupo vê' },
  loja:     { label: 'Só a minha loja',   descricao: 'Apenas quem é da mesma loja' },
  socios:   { label: 'Só sócios',         descricao: 'admin_geral e admin_socio' },
  gestao:   { label: 'Gestão',            descricao: 'Sócios + aux_adm' },
  usuarios: { label: 'Usuários específicos', descricao: 'Só as pessoas escolhidas' },
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

// ─── Recorrência e spans de vários dias ─────────────────────────────────────────

function parseYmd(s: string): [number, number, number] {
  const [y, m, d] = s.split('-').map(Number)
  return [y, m, d]
}
function pad(n: number): string { return String(n).padStart(2, '0') }
function ymd(y: number, m: number, d: number): string { return `${y}-${pad(m)}-${pad(d)}` }
function diasNoMes(y: number, m: number): number { return new Date(Date.UTC(y, m, 0)).getUTCDate() }

/** Soma `n` dias a 'YYYY-MM-DD' (aritmética em UTC, sem fuso local). */
export function addDias(s: string, n: number): string {
  const [y, m, d] = parseYmd(s)
  const dt = new Date(Date.UTC(y, m - 1, d + n))
  return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}
/** Diferença em dias inteiros entre duas datas 'YYYY-MM-DD' (b - a). */
export function diffDias(a: string, b: string): number {
  const [ay, am, ad] = parseYmd(a)
  const [by, bm, bd] = parseYmd(b)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

export type Span = { inicio: string; fim: string }

/**
 * Spans {inicio, fim} em que o evento ocorre e que cruzam a janela [janelaInicio,
 * janelaFim]. Cada ocorrência mantém a duração (dataFim - dataInicio) do evento.
 * - nenhuma: o próprio intervalo, se cruzar a janela.
 * - anual/mensal: repete a partir da âncora (nunca antes dela); dia inexistente
 *   (29/02 fora de bissexto, dia 31 em mês curto) cai para o último dia do mês.
 */
export function ocorrenciasNoIntervalo(
  evento: { dataInicio: string; dataFim: string; recorrencia: string },
  janelaInicio: string,
  janelaFim: string,
): Span[] {
  if (janelaInicio > janelaFim) return []
  const ancora = evento.dataInicio
  const duracao = Math.max(0, diffDias(evento.dataInicio, evento.dataFim))
  const out: Span[] = []

  const considerar = (inicioOcc: string) => {
    if (inicioOcc < ancora) return
    const fimOcc = addDias(inicioOcc, duracao)
    if (fimOcc >= janelaInicio && inicioOcc <= janelaFim) out.push({ inicio: inicioOcc, fim: fimOcc })
  }

  if (evento.recorrencia === 'nenhuma') {
    considerar(ancora)
    return out
  }

  const [ay, am, ad] = parseYmd(ancora)
  const [iy, im] = parseYmd(janelaInicio)
  const [fy, fm] = parseYmd(janelaFim)

  if (evento.recorrencia === 'anual') {
    // Começa um ano antes da janela para pegar um span que iniciou em dezembro.
    for (let y = Math.max(ay, iy - 1); y <= fy; y++) {
      considerar(ymd(y, am, Math.min(ad, diasNoMes(y, am))))
    }
    return out
  }

  if (evento.recorrencia === 'mensal') {
    const ancoraIdx = ay * 12 + (am - 1)
    const inicioIdx = iy * 12 + (im - 1)
    const fimIdx = fy * 12 + (fm - 1)
    for (let idx = Math.max(ancoraIdx, inicioIdx - 1); idx <= fimIdx; idx++) {
      const y = Math.floor(idx / 12)
      const mm = (idx % 12) + 1
      considerar(ymd(y, mm, Math.min(ad, diasNoMes(y, mm))))
    }
    return out
  }

  return []
}

/** Datas 'YYYY-MM-DD' cobertas por um span, limitadas à janela — para a grade mensal. */
export function diasDoSpan(span: Span, janelaInicio: string, janelaFim: string): string[] {
  const ini = span.inicio > janelaInicio ? span.inicio : janelaInicio
  const fim = span.fim < janelaFim ? span.fim : janelaFim
  const dias: string[] = []
  for (let d = ini; d <= fim; d = addDias(d, 1)) dias.push(d)
  return dias
}
