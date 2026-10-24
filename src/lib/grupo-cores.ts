// ─── Cores das bandeiras (grupos econômicos) ───────────────────────────────────
// A barra de "grupo ativo" fica na cor da bandeira, forte e sempre visível, para
// ninguém lançar entrada/saída na empresa errada. As classes precisam aparecer
// literalmente aqui para o Tailwind incluí-las (não dá para montar nome dinâmico).
// Os valores, claro e escuro, ficam no globals.css (--grupo-*).

export const GRUPO_CORES = {
  emerald: { label: 'Verde',    bar: 'bg-grupo-emerald', barHover: 'hover:bg-grupo-emerald-hover', text: 'text-grupo-emerald-texto', chip: 'bg-grupo-emerald-selo text-grupo-emerald-selo-texto', dot: 'bg-grupo-emerald-ponto', swatch: 'bg-grupo-emerald' },
  blue:    { label: 'Azul',     bar: 'bg-grupo-blue', barHover: 'hover:bg-grupo-blue-hover', text: 'text-grupo-blue-texto', chip: 'bg-grupo-blue-selo text-grupo-blue-selo-texto', dot: 'bg-grupo-blue-ponto', swatch: 'bg-grupo-blue' },
  amber:   { label: 'Âmbar',    bar: 'bg-grupo-amber', barHover: 'hover:bg-grupo-amber-hover', text: 'text-grupo-amber-texto', chip: 'bg-grupo-amber-selo text-grupo-amber-selo-texto', dot: 'bg-grupo-amber-ponto', swatch: 'bg-grupo-amber' },
  violet:  { label: 'Roxo',     bar: 'bg-grupo-violet', barHover: 'hover:bg-grupo-violet-hover', text: 'text-grupo-violet-texto', chip: 'bg-grupo-violet-selo text-grupo-violet-selo-texto', dot: 'bg-grupo-violet-ponto', swatch: 'bg-grupo-violet' },
  rose:    { label: 'Vermelho', bar: 'bg-grupo-rose', barHover: 'hover:bg-grupo-rose-hover', text: 'text-grupo-rose-texto', chip: 'bg-grupo-rose-selo text-grupo-rose-selo-texto', dot: 'bg-grupo-rose-ponto', swatch: 'bg-grupo-rose' },
  cyan:    { label: 'Ciano',    bar: 'bg-grupo-cyan', barHover: 'hover:bg-grupo-cyan-hover', text: 'text-grupo-cyan-texto', chip: 'bg-grupo-cyan-selo text-grupo-cyan-selo-texto', dot: 'bg-grupo-cyan-ponto', swatch: 'bg-grupo-cyan' },
  slate:   { label: 'Cinza',    bar: 'bg-grupo-slate', barHover: 'hover:bg-grupo-slate-hover', text: 'text-grupo-slate-texto', chip: 'bg-grupo-slate-selo text-grupo-slate-selo-texto', dot: 'bg-grupo-slate-ponto', swatch: 'bg-grupo-slate' },
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
