import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { MetaDoMes } from '@/lib/meta-vendas'

type Props = {
  meta: MetaDoMes
  grupoNome: string
  vendidoHoje: number
}

const SITUACAO = {
  batida:   { rotulo: 'Meta batida',      cor: 'text-emerald-700', barra: 'bg-emerald-500' },
  acima:    { rotulo: 'Acima do ritmo',   cor: 'text-emerald-700', barra: 'bg-emerald-500' },
  no_ritmo: { rotulo: 'No ritmo',         cor: 'text-sky-700',     barra: 'bg-sky-500'     },
  abaixo:   { rotulo: 'Abaixo do ritmo',  cor: 'text-amber-700',   barra: 'bg-amber-500'   },
} as const

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Compacto para a projeção e para os números da lista: R$ 1,84 mi, R$ 312 mil. */
const brlCurto = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (v >= 10_000) return `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`
  return brl(v)
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`

export function MetaMesCards({ meta, grupoNome, vendidoHoje }: Props) {
  const p = meta.total
  const s = SITUACAO[p.situacao]
  const larguraBarra = Math.min(100, p.percentualAtingido)
  // Onde a projeção cai na régua da meta — some quando passa de 100%.
  const marcaProjecao = p.meta > 0 ? Math.min(100, (p.projecao / p.meta) * 100) : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="col-span-2 lg:col-span-4">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-500">
            Meta do Mês · {grupoNome}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2 flex-wrap">
            <p className="text-3xl font-bold">{brl(p.vendidas)}</p>
            <p className="text-lg text-slate-400">/ {brl(p.meta)}</p>
            <p className={`ml-auto text-sm font-medium ${s.cor}`}>{s.rotulo}</p>
          </div>

          <div className="relative mt-3 h-2 rounded-full bg-slate-100 overflow-hidden">
            <div className={`h-full rounded-full ${s.barra}`} style={{ width: `${larguraBarra}%` }} />
          </div>
          {/* Marca de onde o mês fecha no ritmo atual */}
          {p.situacao !== 'batida' && marcaProjecao > 0 && (
            <div className="relative h-3">
              <span
                className="absolute -translate-x-1/2 text-[10px] text-slate-400 whitespace-nowrap"
                style={{ left: `${marcaProjecao}%` }}
              >
                ▲ projeção {brlCurto(p.projecao)}
              </span>
            </div>
          )}

          <p className="text-xs text-slate-400 mt-2">
            {pct(p.percentualAtingido)} da meta · {p.diasDeVendaDecorridos} de {p.diasDeVendaNoMes} dias
            de venda (seg–sáb)
          </p>

          {/* Quebra por loja: o total do grupo esconde a loja que parou. */}
          <ul className="mt-4 divide-y border-t">
            {meta.lojas.map(l => (
              <li key={l.lojaId} className="flex items-center gap-3 py-2 text-sm">
                <span className="w-36 shrink-0 truncate">{l.loja}</span>
                <span className="w-40 shrink-0 text-slate-500 tabular-nums">
                  {brlCurto(l.realizado)} <span className="text-slate-300">/ {brlCurto(l.meta)}</span>
                </span>
                <span className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden min-w-12">
                  <span
                    className={`block h-full rounded-full ${l.batida ? 'bg-emerald-500' : 'bg-slate-400'}`}
                    style={{ width: `${Math.min(100, l.percentual)}%` }}
                  />
                </span>
                <span className={`w-16 text-right tabular-nums ${l.batida ? 'text-emerald-700 font-medium' : 'text-slate-500'}`}>
                  {pct(l.percentual)}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Vendas Hoje</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{brlCurto(vendidoHoje)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            ritmo do mês: {brlCurto(p.ritmoDiario)}/dia
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Projeção do Mês</CardTitle></CardHeader>
        <CardContent>
          <p className={`text-3xl font-bold ${s.cor}`}>{brlCurto(p.projecao)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {p.necessarioPorDia === null
              ? p.faltam === 0
                ? 'meta atingida'
                : `faltaram ${brlCurto(p.faltam)} — sem dia de venda restante`
              : `faltam ${brlCurto(p.faltam)} · ${brlCurto(p.necessarioPorDia)}/dia em ${p.diasDeVendaRestantes} dias`}
          </p>
        </CardContent>
      </Card>

      <Card className="col-span-2">
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Lojas na meta</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">
            {meta.lojas.filter(l => l.batida).length}
            <span className="text-lg text-slate-400"> / {meta.lojas.length}</span>
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {meta.lojas.filter(l => !l.batida).length === 0
              ? 'todas bateram a meta do mês'
              : `${meta.lojas.filter(l => !l.batida).length} ainda não bateram`}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
