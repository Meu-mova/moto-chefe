import Link from 'next/link'
import type { MetaDoMes } from '@/lib/meta-vendas'
import { Secao } from './painel-secoes'

type Props = {
  meta: MetaDoMes
  grupoNome: string
  vendidoHoje: number
}

const SITUACAO = {
  batida:   { rotulo: 'Meta batida',     cor: 'text-primary-text', barra: 'bg-primary' },
  acima:    { rotulo: 'Acima do ritmo',  cor: 'text-primary-text', barra: 'bg-primary' },
  no_ritmo: { rotulo: 'No ritmo',        cor: 'text-foreground',   barra: 'bg-chart-3' },
  abaixo:   { rotulo: 'Abaixo do ritmo', cor: 'text-warning',      barra: 'bg-warning' },
} as const

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })

/** Compacto para a projeção e para os números da lista: R$ 1,84 mi, R$ 312 mil. */
const brlCurto = (v: number) => {
  if (v >= 1_000_000) return `R$ ${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} mi`
  if (v >= 10_000) return `R$ ${Math.round(v / 1000).toLocaleString('pt-BR')} mil`
  return brl(v)
}

const pct = (v: number) => `${v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`

function Celula({ rotulo, children, nota }: { rotulo: string; children: React.ReactNode; nota?: React.ReactNode }) {
  return (
    <div className="min-w-0 border-b border-border px-4 py-3 sm:border-r lg:border-b-0 lg:last:border-r-0">
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <div className="mt-0.5 text-xl font-bold tabular-nums text-foreground">{children}</div>
      {nota && <p className="mt-0.5 text-xs text-muted-foreground">{nota}</p>}
    </div>
  )
}

export function MetaMesCards({ meta, grupoNome, vendidoHoje }: Props) {
  const p = meta.total
  const s = SITUACAO[p.situacao]
  const larguraBarra = Math.min(100, p.percentualAtingido)
  const batidas = meta.lojas.filter(l => l.batida).length
  // Onde a projeção cai na régua da meta; some quando a meta já foi batida.
  const marcaProjecao = p.meta > 0 ? Math.min(100, (p.projecao / p.meta) * 100) : 0

  return (
    <Secao
      titulo={`Meta do mês · ${grupoNome}`}
      acao={<Link href="/admin/metas" className="text-xs font-semibold text-primary-text hover:underline">Ver metas</Link>}
    >
      <div className="mt-3 grid overflow-hidden rounded-md border border-border bg-card sm:grid-cols-2 lg:grid-cols-4">
        <Celula rotulo="Vendido no mês" nota={<><span className={`font-semibold ${s.cor}`}>{s.rotulo}</span> · {pct(p.percentualAtingido)} em {p.diasDeVendaDecorridos} de {p.diasDeVendaNoMes} dias (seg–sáb)</>}>
          {brl(p.vendidas)} <span className="text-sm font-medium text-muted-foreground">/ {brl(p.meta)}</span>
          <span role="progressbar" aria-label="Meta do mês atingida" aria-valuenow={Math.round(p.percentualAtingido)} aria-valuemin={0} aria-valuemax={100}
            className="relative mt-2 block h-1.5 rounded-full bg-muted">
            <span className={`block h-full rounded-full ${s.barra}`} style={{ width: `${larguraBarra}%` }} />
            {p.situacao !== 'batida' && marcaProjecao > 0 && (
              <span aria-hidden title={`Projeção ${brlCurto(p.projecao)}`} className="absolute -top-1 h-3.5 w-0.5 -translate-x-1/2 bg-foreground" style={{ left: `${marcaProjecao}%` }} />
            )}
          </span>
          {p.situacao !== 'batida' && marcaProjecao > 0 && (
            <span className="mt-1 block text-xs font-normal text-muted-foreground">| marca: projeção de {brlCurto(p.projecao)}</span>
          )}
        </Celula>
        <Celula rotulo="Vendido hoje" nota={`ritmo do mês: ${brlCurto(p.ritmoDiario)}/dia`}>{brlCurto(vendidoHoje)}</Celula>
        <Celula
          rotulo="Projeção do mês"
          nota={p.necessarioPorDia === null
            ? p.faltam === 0 ? 'meta atingida' : `faltaram ${brlCurto(p.faltam)}, sem dia de venda restante`
            : `faltam ${brlCurto(p.faltam)} · ${brlCurto(p.necessarioPorDia)}/dia em ${p.diasDeVendaRestantes} dias`}
        >
          <span className={s.cor}>{brlCurto(p.projecao)}</span>
        </Celula>
        <Celula rotulo="Lojas na meta" nota={batidas === meta.lojas.length ? 'todas bateram a meta do mês' : `${meta.lojas.length - batidas} ainda não bateram`}>
          {batidas} <span className="text-sm font-medium text-muted-foreground">/ {meta.lojas.length}</span>
        </Celula>
      </div>

      {/* Quebra por loja: o total do grupo esconde a loja que parou. */}
      <ul className="mt-2 divide-y divide-border">
        {meta.lojas.map(l => (
          <li key={l.lojaId} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-1 py-2 text-sm sm:grid-cols-[10rem_11rem_1fr_4rem]">
            <span className="truncate text-foreground">{l.loja}</span>
            <span className="tabular-nums text-muted-foreground">
              {brlCurto(l.realizado)} / {brlCurto(l.meta)}
            </span>
            <span role="progressbar" aria-label={`Meta de ${l.loja}`} aria-valuenow={Math.round(l.percentual)} aria-valuemin={0} aria-valuemax={100}
              className="h-1.5 overflow-hidden rounded-full bg-muted">
              <span className={`block h-full ${l.batida ? 'bg-primary' : 'bg-input'}`} style={{ width: `${Math.min(100, l.percentual)}%` }} />
            </span>
            <span className={`text-right tabular-nums ${l.batida ? 'font-semibold text-primary-text' : 'text-muted-foreground'}`}>
              {pct(l.percentual)}
            </span>
          </li>
        ))}
      </ul>
    </Secao>
  )
}
