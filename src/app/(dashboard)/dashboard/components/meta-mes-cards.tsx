import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { ProjecaoMeta } from '@/lib/meta-vendas'

type Props = {
  projecao: ProjecaoMeta
  grupoNome: string
  vendasHoje: number
}

const SITUACAO = {
  batida:   { rotulo: 'Meta batida',      cor: 'text-emerald-700', barra: 'bg-emerald-500' },
  acima:    { rotulo: 'Acima do ritmo',   cor: 'text-emerald-700', barra: 'bg-emerald-500' },
  no_ritmo: { rotulo: 'No ritmo',         cor: 'text-sky-700',     barra: 'bg-sky-500'     },
  abaixo:   { rotulo: 'Abaixo do ritmo',  cor: 'text-amber-700',   barra: 'bg-amber-500'   },
} as const

const int = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
const dec = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function MetaMesCards({ projecao: p, grupoNome, vendasHoje }: Props) {
  const s = SITUACAO[p.situacao]
  const larguraBarra = Math.min(100, p.percentualAtingido)
  // Onde a projeção cai na régua da meta — some quando passa de 100%.
  const marcaProjecao = p.meta > 0 ? Math.min(100, (p.projecao / p.meta) * 100) : 0

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className="col-span-2">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm text-slate-500">
            Meta do Mês · {grupoNome}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-baseline gap-2">
            <p className="text-3xl font-bold">{int(p.vendidas)}</p>
            <p className="text-lg text-slate-400">/ {int(p.meta)} motos</p>
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
                ▲ projeção
              </span>
            </div>
          )}

          <p className="text-xs text-slate-400 mt-2">
            {dec(p.percentualAtingido)}% da meta · {p.diasDeVendaDecorridos} de {p.diasDeVendaNoMes} dias
            de venda (seg–sáb)
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Vendas Hoje</CardTitle></CardHeader>
        <CardContent>
          <p className="text-3xl font-bold">{int(vendasHoje)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            ritmo do mês: {dec(p.ritmoDiario)}/dia
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm text-slate-500">Projeção do Mês</CardTitle></CardHeader>
        <CardContent>
          <p className={`text-3xl font-bold ${s.cor}`}>{int(p.projecao)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            {p.necessarioPorDia === null
              ? p.faltam === 0
                ? 'meta atingida'
                : `faltaram ${int(p.faltam)} — sem dia de venda restante`
              : `faltam ${int(p.faltam)} · ${dec(p.necessarioPorDia)}/dia em ${p.diasDeVendaRestantes} dias`}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
