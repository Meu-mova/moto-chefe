// ─── Cores das bandeiras (grupos econômicos) ───────────────────────────────────
// A barra de "grupo ativo" fica na cor da bandeira, forte e sempre visível, para
// ninguém lançar entrada/saída na empresa errada. As classes precisam aparecer
// literalmente aqui para o Tailwind incluí-las (não dá para montar nome dinâmico).

export const GRUPO_CORES = {
  emerald: { label: 'Verde',   bar: 'bg-emerald-600', barHover: 'hover:bg-emerald-700', text: 'text-emerald-50', chip: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500', swatch: 'bg-emerald-600' },
  blue:    { label: 'Azul',    bar: 'bg-blue-700',    barHover: 'hover:bg-blue-800',    text: 'text-blue-50',    chip: 'bg-blue-100 text-blue-800',       dot: 'bg-blue-500',    swatch: 'bg-blue-700' },
  amber:   { label: 'Âmbar',   bar: 'bg-amber-600',   barHover: 'hover:bg-amber-700',   text: 'text-amber-50',   chip: 'bg-amber-100 text-amber-900',     dot: 'bg-amber-500',   swatch: 'bg-amber-600' },
  violet:  { label: 'Roxo',    bar: 'bg-violet-700',  barHover: 'hover:bg-violet-800',  text: 'text-violet-50',  chip: 'bg-violet-100 text-violet-800',   dot: 'bg-violet-500',  swatch: 'bg-violet-700' },
  rose:    { label: 'Vermelho',bar: 'bg-rose-700',    barHover: 'hover:bg-rose-800',    text: 'text-rose-50',    chip: 'bg-rose-100 text-rose-800',       dot: 'bg-rose-500',    swatch: 'bg-rose-700' },
  cyan:    { label: 'Ciano',   bar: 'bg-cyan-700',    barHover: 'hover:bg-cyan-800',    text: 'text-cyan-50',    chip: 'bg-cyan-100 text-cyan-800',       dot: 'bg-cyan-500',    swatch: 'bg-cyan-700' },
  slate:   { label: 'Cinza',   bar: 'bg-slate-700',   barHover: 'hover:bg-slate-800',   text: 'text-slate-50',   chip: 'bg-slate-100 text-slate-800',     dot: 'bg-slate-500',   swatch: 'bg-slate-700' },
} as const

export type GrupoCor = keyof typeof GRUPO_CORES
export const GRUPO_CORES_KEYS = Object.keys(GRUPO_CORES) as GrupoCor[]

// Fallback determinístico pela string do id, para grupos sem cor definida ainda.
const FALLBACK: GrupoCor[] = ['emerald', 'blue', 'amber', 'violet', 'rose', 'cyan', 'slate']
function hash(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

export function corDoGrupo(grupo: { id: string; cor?: string | null }) {
  const chave = (grupo.cor && grupo.cor in GRUPO_CORES)
    ? grupo.cor as GrupoCor
    : FALLBACK[hash(grupo.id) % FALLBACK.length]
  return GRUPO_CORES[chave]
}
